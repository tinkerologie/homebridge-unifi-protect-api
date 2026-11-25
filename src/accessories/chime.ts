import type { API, Logging, PlatformAccessory, Service } from 'homebridge'
import { setImmediate } from 'node:timers'
import { errorMessage } from '../protect/errors.js'

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

/** On and Brightness writes collected within one tick, settled by one update. */
interface PendingWrite {
  on?: boolean
  brightness?: number
  /** The service generation this batch was created at. See `generation`. */
  generation: number
  waiters: { resolve: () => void, reject: (error: unknown) => void }[]
}

// Keyed by service for the same reason as `lastAudible`: a rebuild replaces
// the onSet closures, and a write already in flight must still coalesce.
const pendingWrites = new WeakMap<Service, PendingWrite>()

// Bumped by every new write batch and every console update. Writes run
// concurrently and can finish out of order, so a batch only touches the tile
// (or the remembered level) while it is still the newest thing that happened.
const generation = new WeakMap<Service, number>()
function nextGeneration(service: Service): number {
  const next = (generation.get(service) ?? 0) + 1
  generation.set(service, next)
  return next
}

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
  nextGeneration(service)
  if (volume > 0)
    lastAudible.set(service, volume)
  service.updateCharacteristic(C.On, volume > 0)
  service.updateCharacteristic(C.Brightness, volume)

  const isCurrent = (batch: PendingWrite) => generation.get(service) === batch.generation

  const flush = async (batch: PendingWrite): Promise<void> => {
    // Off always silences. Otherwise an explicit brightness wins; a bare On
    // restores the last audible level so the toggle is never inert and never
    // forgets where the volume was.
    const target = batch.on === false
      ? 0
      : batch.brightness ?? lastAudible.get(service) ?? FULL_VOLUME
    try {
      await callbacks.setVolume(String(device.id), target)
    }
    catch (error) {
      // errorMessage, never the error object: it carries request context that
      // util.inspect has printed the API key from before.
      log.warn(`Could not change the volume on "${label}": ${errorMessage(error)}`)
      const failure = new api.hap.HapStatusError(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
      for (const waiter of batch.waiters)
        waiter.reject(failure)
      return
    }
    if (target > 0 && isCurrent(batch))
      lastAudible.set(service, target)
    for (const waiter of batch.waiters)
      waiter.resolve()
    // HAP stores the value the client wrote only AFTER a set handler resolves,
    // so a correction made before that is lost. Correct the tile once HAP has
    // committed, unless a newer write or a console update has happened since.
    setImmediate(() => {
      if (!isCurrent(batch))
        return
      service.updateCharacteristic(C.On, target > 0)
      service.updateCharacteristic(C.Brightness, target)
    })
  }

  // HomeKit writes On and Brightness together when a slider is dragged on an
  // off tile. Applied separately they raced - the On restore (last audible or
  // 100) could land after the slider value - so both writes in one tick are
  // folded into a single volume update that settles both handlers.
  const write = async (change: Pick<PendingWrite, 'on' | 'brightness'>): Promise<void> => {
    const existing = pendingWrites.get(service)
    const batch: PendingWrite = existing ?? {
      generation: nextGeneration(service),
      waiters: [],
    }
    if (!existing) {
      pendingWrites.set(service, batch)
      setImmediate(() => {
        pendingWrites.delete(service)
        void flush(batch)
      })
    }
    Object.assign(batch, change)
    return new Promise((resolve, reject) => {
      batch.waiters.push({ resolve, reject })
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
