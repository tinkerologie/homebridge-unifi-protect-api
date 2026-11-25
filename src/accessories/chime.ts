import type { API, Logging, PlatformAccessory, Service } from 'homebridge'
import { setImmediate } from 'node:timers'
import { errorMessage } from '../protect/errors.js'
import { writeFailure } from './write-failure.js'

/**
 * The write a chime volume control makes back to the console. `volume` is the
 * 0-100 loudness applied to every doorbell this chime is paired to; the
 * platform preserves each ring's other fields (`ringtoneId`, `repeatTimes`).
 */
export interface ChimeCallbacks {
  setVolume: (deviceId: string, volume: number) => Promise<void>
}

/** Stable subtype for the chime's volume Lightbulb. */
const VOLUME_SUBTYPE = 'chime-volume'

/** HomeKit has no chime accessory; a Lightbulb turns to full when switched on. */
const FULL_VOLUME = 100

// Services survive reconciliation; their onSet closures are replaced. Remember
// the audible level here so a muted console echo cannot reset it to full volume.
const lastAudible = new WeakMap<Service, number>()

/**
 * HAP gives a set handler 9 s; a write has 7 s once it reaches the console
 * (WRITE_POLICY in client.ts). A write that waited longer than the difference
 * behind a slow one cannot answer in time, so it fails fast instead.
 */
const QUEUED_WRITE_BUDGET_MS = 2_000

/** On and Brightness writes collected within one tick, settled by one update. */
interface PendingWrite {
  on?: boolean
  brightness?: number
  /** One per set handler; `createdAt` is `performance.now()` when it was called. */
  waiters: { createdAt: number, resolve: () => void, reject: (error: unknown) => void }[]
}

// Keyed by service for the same reason as `lastAudible`: a rebuild replaces
// the onSet closures, and a write already in flight must still coalesce.
const pendingWrites = new WeakMap<Service, PendingWrite>()

// Writes for one chime are sent one at a time, in order, so the console
// always ends on the newest write. While one is in flight, every write that
// arrives is merged into a single queued batch: only the newest intent needs
// to reach the console.
const inFlight = new WeakSet<Service>()
const queuedWrite = new WeakMap<Service, PendingWrite>()

// The flush of the current wiring. A rebuild replaces it, and a queued batch
// must run through the newest one.
const flushers = new WeakMap<Service, (batch: PendingWrite) => Promise<void>>()

/** Folds a later batch into an earlier one: the later intent wins. */
function merge(into: PendingWrite, from: PendingWrite): void {
  if (from.on === false) {
    // Off silences, whatever volume was queued before it.
    into.on = false
    delete into.brightness
  }
  else if (from.brightness !== undefined) {
    // A later volume is a request to hear the chime at that volume, so it
    // cancels an earlier Off. A same-tick Off and volume stay in one batch.
    if (from.on === undefined)
      delete into.on
    else
      into.on = from.on
    into.brightness = from.brightness
  }
  else {
    // A bare On (every batch carries On or Brightness, and Off and volume
    // are handled above). After Off or 0 % it means "turn it back on": restore the last
    // audible level, not the queued silence. After a real volume, keep it.
    if (into.on === false || into.brightness === 0)
      delete into.brightness
    into.on = true
  }
  into.waiters.push(...from.waiters)
}

async function runWrites(service: Service, batch: PendingWrite): Promise<void> {
  inFlight.add(service)
  try {
    await flushers.get(service)!(batch)
  }
  finally {
    inFlight.delete(service)
  }
  const next = queuedWrite.get(service)
  if (next) {
    queuedWrite.delete(service)
    await runWrites(service, next)
  }
}

function submitWrite(service: Service, batch: PendingWrite): void {
  if (!inFlight.has(service)) {
    // runWrites never rejects: each flush settles its own handlers.
    void runWrites(service, batch)
    return
  }
  const queued = queuedWrite.get(service)
  if (queued)
    merge(queued, batch)
  else
    queuedWrite.set(service, batch)
}

// The volume the tile must show: the latest console update, or the latest
// write the console accepted after it. HAP commits the client's written value
// AFTER a set handler resolves, so every write ends by putting this back.
const shownVolume = new WeakMap<Service, number>()

// Bumped by every console update, so a write that was in flight when one
// arrived does not replace the newer console value.
const consoleRevision = new WeakMap<Service, number>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The chime's loudness as a single 0-100 value: the maximum across every paired
 * doorbell's ring setting, so the tile reads on whenever any doorbell is
 * audible. Absent or malformed ring settings read as silent.
 */
export function chimeVolume(device: Record<string, unknown>): number {
  const rings = Array.isArray(device.ringSettings)
    ? device.ringSettings
    : []
  let volume = 0
  for (const ring of rings) {
    const value = isRecord(ring)
      ? ring.volume
      : undefined
    if (typeof value === 'number' && value > volume)
      volume = value
  }
  return Math.min(FULL_VOLUME, Math.max(0, Math.round(volume)))
}

/**
 * Whether the payload carries the ring settings this module reads. `chimeSchema`
 * makes `ringSettings` required, but `ProtectClient.validate` returns the raw
 * payload when validation fails, so a Ubiquiti field rename delivers a chime
 * without it — the same floor `camera.ts` applies before writing a SerialNumber.
 */
export function isUnderstoodChime(device: Record<string, unknown>): boolean {
  return Array.isArray(device.ringSettings)
}

/**
 * HomeKit rejects a name over 64 characters, and the name comes from the
 * console. Truncate rather than let HAP warn on every discovery.
 */
function deviceLabel(device: Record<string, unknown>): string {
  const name = typeof device.name === 'string'
    ? device.name.trim()
    : ''
  return name
    ? name.slice(0, 48)
    : 'Chime'
}

/**
 * Exposes a Protect chime as a HomeKit Lightbulb whose brightness is the ring
 * volume. Idempotent — a later discovery or a `deviceUpdate` frame re-runs it to
 * push new state, exactly as `platform.ts` does for cameras and lights.
 */
export function buildChimeServices(
  api: API,
  log: Logging,
  accessory: PlatformAccessory,
  device: Record<string, unknown>,
  callbacks: ChimeCallbacks,
): void {
  const { Characteristic: C, Service: S } = api.hap
  const label = deviceLabel(device)

  const info = accessory.getService(S.AccessoryInformation) ?? accessory.addService(S.AccessoryInformation)
  // Only from a payload we understood — see `isUnderstoodChime`.
  if (isUnderstoodChime(device)) {
    info.setCharacteristic(C.Manufacturer, 'Ubiquiti')
      .setCharacteristic(C.Model, typeof device.modelKey === 'string'
        ? device.modelKey
        : 'chime')
      .setCharacteristic(C.SerialNumber, typeof device.mac === 'string'
        ? device.mac
        : String(device.id ?? 'unknown'))
  }

  let bulb = accessory.getServiceById(S.Lightbulb, VOLUME_SUBTYPE)
  if (!bulb) {
    // The name is written once, here — a rewrite on every discovery would
    // overwrite whatever the user renamed the tile to in Home.app.
    bulb = accessory.addService(S.Lightbulb, `${label} Volume`, VOLUME_SUBTYPE)
    log.debug(`Added chime volume service to "${label}".`)
  }
  wireVolume(api, log, bulb, device, label, callbacks)
}

function wireVolume(
  api: API,
  log: Logging,
  service: Service,
  device: Record<string, unknown>,
  label: string,
  callbacks: ChimeCallbacks,
): void {
  const { Characteristic: C } = api.hap
  // Positive console updates replace the remembered level; a muted echo keeps
  // it. Reads at handler call time also survive replacement of these closures.
  const volume = chimeVolume(device)
  // Only a CHANGED volume is news. An unrelated device update, or a discovery
  // that read the console before a write landed, repeats the old volume and
  // must not make an in-flight write look superseded.
  if (shownVolume.get(service) !== volume) {
    consoleRevision.set(service, (consoleRevision.get(service) ?? 0) + 1)
    shownVolume.set(service, volume)
  }
  if (volume > 0)
    lastAudible.set(service, volume)
  service.updateCharacteristic(C.On, volume > 0)
  service.updateCharacteristic(C.Brightness, volume)

  const fail = (waiters: PendingWrite['waiters']) => {
    // Both characteristics, because a coalesced batch may have written both.
    writeFailure(api, service.getCharacteristic(C.On))
    const failure = writeFailure(api, service.getCharacteristic(C.Brightness))
    for (const waiter of waiters)
      waiter.reject(failure)
  }

  const flush = async (batch: PendingWrite): Promise<void> => {
    // Per change: a step that has waited too long fails on its own, and does
    // not take a newer change merged into the same batch down with it. The
    // target already holds the newest intent.
    const now = performance.now()
    const expired = batch.waiters.filter(waiter => now - waiter.createdAt > QUEUED_WRITE_BUDGET_MS)
    if (expired.length) {
      log.warn(`Could not change the volume on "${label}": an earlier change was still in progress.`)
      fail(expired)
      batch.waiters = batch.waiters.filter(waiter => !expired.includes(waiter))
      if (!batch.waiters.length)
        return
    }
    // Off always silences. Otherwise an explicit brightness wins; a bare On
    // restores the last audible level so the toggle is never inert and never
    // forgets where the volume was.
    const target = batch.on === false
      ? 0
      : batch.brightness ?? lastAudible.get(service) ?? FULL_VOLUME
    const revision = consoleRevision.get(service)
    try {
      await callbacks.setVolume(String(device.id), target)
    }
    catch (error) {
      // errorMessage, never the error object: it carries request context that
      // util.inspect has printed the API key from before.
      log.warn(`Could not change the volume on "${label}": ${errorMessage(error)}`)
      fail(batch.waiters)
      return
    }
    // A console update that arrived while this write was in flight is newer
    // than the write, so it keeps the tile and the remembered level.
    if (consoleRevision.get(service) === revision) {
      shownVolume.set(service, target)
      if (target > 0)
        lastAudible.set(service, target)
    }
    for (const waiter of batch.waiters)
      waiter.resolve()
    // Runs after HAP has committed the client's values, and always puts the
    // newest known volume back: HAP may have just overwritten it.
    setImmediate(() => {
      // Always set: wireVolume records the console volume before any handler exists.
      const shown = shownVolume.get(service)!
      service.updateCharacteristic(C.On, shown > 0)
      service.updateCharacteristic(C.Brightness, shown)
    })
  }
  flushers.set(service, flush)

  // HomeKit writes On and Brightness together when a slider is dragged on an
  // off tile. Applied separately they raced - the On restore (last audible or
  // 100) could land after the slider value - so both writes in one tick are
  // folded into a single volume update that settles both handlers.
  const write = async (change: Pick<PendingWrite, 'on' | 'brightness'>): Promise<void> => {
    const existing = pendingWrites.get(service)
    const batch: PendingWrite = existing ?? { waiters: [] }
    if (!existing) {
      pendingWrites.set(service, batch)
      setImmediate(() => {
        pendingWrites.delete(service)
        submitWrite(service, batch)
      })
    }
    Object.assign(batch, change)
    return new Promise((resolve, reject) => {
      batch.waiters.push({
        createdAt: performance.now(),
        resolve,
        reject,
      })
    })
  }

  const on = service.getCharacteristic(C.On)
  on.removeOnSet()
  on.onSet(async value => write({
    on: Boolean(value),
  }))

  const brightness = service.getCharacteristic(C.Brightness)
  brightness.removeOnSet()
  brightness.onSet(async value => write({
    brightness: Math.min(FULL_VOLUME, Math.max(0, Math.round(Number(value)))),
  }))
}
