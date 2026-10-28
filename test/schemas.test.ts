import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cameraSchema,
  chimeSchema,
  existingRtspsStreamsSchema,
  fobArmControlSettingsSchema,
  fobKeypadSettingsSchema,
  lightSchema,
  linkStationThreadStateSchema,
  liveviewSchema,
  nvrSchema,
  relayOutputStateSchema,
} from '../src/protect/schemas.js'

const load = (n: string) => JSON.parse(readFileSync(`test/fixtures/${n}.json`, 'utf8'))

describe('generated schemas parse real hardware payloads', () => {
  it('retains the three hardware-proven optional field overrides', () => {
    for (const original of load('cameras')) {
      const camera = { ...original }
      delete camera.lcdMessage
      expect(cameraSchema.safeParse(camera).success).toBe(true)
    }
    for (const original of load('chimes')) {
      const chime = structuredClone(original)
      for (const ring of chime.ringSettings) delete ring.ringtoneId
      expect(chimeSchema.safeParse(chime).success).toBe(true)
    }
    const nvr = structuredClone(load('nvrs'))
    delete nvr.armMode.armProfileId
    expect(nvrSchema.safeParse(nvr).success).toBe(true)
  })

  it('accepts the 7.3.70 fob controls and validates keypad volume bounds', () => {
    expect(fobArmControlSettingsSchema.safeParse({ enabled: true, armProfileId: null, nightProfileId: null }).success).toBe(true)
    expect(fobKeypadSettingsSchema.safeParse({ beepEnabled: true, beepVolume: 50 }).success).toBe(true)
    expect(fobKeypadSettingsSchema.safeParse({ beepEnabled: true, beepVolume: 101 }).success).toBe(false)
  })

  it('validates the 7.3.70 thread network fields and optional network state', () => {
    const network = {
      status: 'ready',
      role: 'leader',
      networkName: 'test',
      channel: 15,
      panId: 'ABCD',
      extendedPanId: '0123456789ABCDEF',
      joinedDeviceCount: 1,
      errorReason: null,
      lastUpdatedAt: 1,
    }
    expect(linkStationThreadStateSchema.safeParse({ network: null }).success).toBe(true)
    expect(linkStationThreadStateSchema.safeParse({ network }).success).toBe(true)
    expect(linkStationThreadStateSchema.safeParse({ network: { ...network, panId: 'ZZZZ' } }).success).toBe(false)
    expect(linkStationThreadStateSchema.safeParse({ network: { ...network, channel: 27 } }).success).toBe(false)
  })
  it('parses every camera', () => {
    // .parse, not .safeParse(...).success — a failure must name the offending
    // field in CI rather than print `false !== true`.
    for (const camera of load('cameras')) cameraSchema.parse(camera)
  })

  it('parses chimes, liveviews and the nvr', () => {
    for (const chime of load('chimes')) chimeSchema.parse(chime)
    for (const view of load('liveviews')) liveviewSchema.parse(view)
    nvrSchema.parse(load('nvrs'))
  })

  it('parses every light', () => {
    for (const light of load('lights')) lightSchema.parse(light)
  })

  it('parses the rtsps stream response', () => {
    existingRtspsStreamsSchema.parse(load('rtsps-stream'))
  })

  it('rejects unknown fields on the rtsps stream response', () => {
    // The spec sets additionalProperties: false here, so this schema alone does
    // NOT preserve unknown fields. Pinned deliberately: it is the one place a
    // firmware bump can fail validation, which is why consumers must degrade.
    expect(existingRtspsStreamsSchema.safeParse({ ...load('rtsps-stream'), ultra: null }).success).toBe(false)
  })

  it('accepts null for nullable enums such as relay output state', () => {
    // type: ["string","null"] alongside `enum` — the generator must emit both
    // the enum and the .nullable(), not just whichever branch it checks first.
    expect(relayOutputStateSchema.parse(null)).toBeNull()
    expect(relayOutputStateSchema.parse('offOtp')).toBe('offOtp')
  })

  it('keeps redacted cross-references consistent', () => {
    // Redaction is hash-based, so every id that points at a camera must still
    // resolve. If this fails the fixtures were redacted inconsistently and any
    // reconciliation test built on them is meaningless.
    const ids = new Set(load('cameras').map((c: { id: string }) => c.id))
    for (const chime of load('chimes')) {
      for (const id of chime.cameraIds) expect(ids.has(id)).toBe(true)
      for (const ring of chime.ringSettings) expect(ids.has(ring.cameraId)).toBe(true)
    }
    for (const view of load('liveviews')) {
      for (const slot of view.slots) {
        for (const id of slot.cameras) expect(ids.has(id)).toBe(true)
      }
    }
  })

  it('preserves unknown fields so a firmware update cannot silently drop data', () => {
    const [camera] = load('cameras')
    const parsed = cameraSchema.parse({ ...camera, someFutureField: 42 })
    expect((parsed as Record<string, unknown>).someFutureField).toBe(42)
  })

  it('rejects an unknown enum member — Task 3 must degrade, not throw', () => {
    // A new videoMode in a future firmware must degrade, not crash the plugin.
    const [camera] = load('cameras')
    const result = cameraSchema.safeParse({ ...camera, videoMode: 'someFutureMode' })
    expect(result.success).toBe(false) // strict at the schema layer...
    // ...and Task 3 is responsible for turning this into a warning, not a throw.
  })
})
