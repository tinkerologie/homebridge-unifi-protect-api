import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildChimeServices, chimeVolume, isUnderstoodChime } from '../src/accessories/chime.js'
import { C, FakeAccessory, FakeHapStatusError, hap, hapSet, S } from './fake-hap.js'

const chimes = JSON.parse(readFileSync('test/fixtures/chimes.json', 'utf8'))
const dingDong = chimes[0]

const api = { hap } as never
const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn(),
}

function setup(device: Record<string, unknown>, overrides: { setVolume?: (id: string, v: number) => Promise<void> } = {}) {
  const setVolume = vi.fn(overrides.setVolume ?? (async () => {}))
  const accessory = new FakeAccessory()
  const build = (next: Record<string, unknown> = device) =>
    buildChimeServices(api, log as never, accessory as never, next, { setVolume })
  build()
  return { accessory, build, setVolume }
}

describe('chimeVolume', () => {
  it('reads the loudest paired ring', () => {
    expect(chimeVolume(dingDong)).toBe(80)
    expect(chimeVolume({
      ringSettings: [
        { volume: 20 },
        { volume: 65 },
      ],
    })).toBe(65)
  })

  it('is silent when there are no ring settings or they are malformed', () => {
    expect(chimeVolume({})).toBe(0)
    expect(chimeVolume({ ringSettings: 'nope' })).toBe(0)
    expect(chimeVolume({
      ringSettings: [{}, 7],
    })).toBe(0)
  })
})

describe('isUnderstoodChime', () => {
  it('is true only when ring settings are present', () => {
    expect(isUnderstoodChime(dingDong)).toBe(true)
    expect(isUnderstoodChime({ id: 'x' })).toBe(false)
  })
})

describe('buildChimeServices', () => {
  beforeEach(() => vi.clearAllMocks())

  it('builds a volume Lightbulb and accessory information', () => {
    const { accessory } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    expect(bulb).toBeDefined()
    expect(bulb.valueOf_(C.On)).toBe(true)
    expect(bulb.valueOf_(C.Brightness)).toBe(80)
    expect(accessory.getService(S.AccessoryInformation)?.valueOf_(C.SerialNumber)).toBe(dingDong.mac)
    expect(accessory.getService(S.AccessoryInformation)?.valueOf_(C.Model)).toBe('chime')
  })

  it('reads off when every ring is silent', () => {
    const { accessory } = setup({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 0, repeatTimes: 1 },
      ],
    })
    expect(accessory.getServiceById(S.Lightbulb, 'chime-volume')!.valueOf_(C.On)).toBe(false)
  })

  it('is idempotent — a second build adds nothing and leaves working handlers', async () => {
    const { accessory, build, setVolume } = setup(dingDong)
    const before = accessory.services.length
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    build()
    build()

    expect(accessory.services.length).toBe(before)
    expect(accessory.getServiceById(S.Lightbulb, 'chime-volume')).toBe(bulb)
    await bulb.getCharacteristic(C.Brightness).setHandler!(30)
    expect(setVolume).toHaveBeenCalledTimes(1)
  })

  it('writes the exact brightness as the new volume', async () => {
    const { accessory, setVolume } = setup(dingDong)
    await accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.Brightness).setHandler!(55)
    expect(setVolume).toHaveBeenCalledWith(dingDong.id, 55)
  })

  it('restores full volume when switched on from silent', async () => {
    const silent = {
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 0, repeatTimes: 1 },
      ],
    }
    const { accessory, setVolume } = setup(silent)
    await accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.On).setHandler!(true)
    expect(setVolume).toHaveBeenCalledWith(dingDong.id, 100)
  })

  it('silences on a switch-off', async () => {
    const { accessory, setVolume } = setup(dingDong)
    await accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.On).setHandler!(false)
    expect(setVolume).toHaveBeenCalledWith(dingDong.id, 0)
  })

  it('restores the last set brightness across an off then on', async () => {
    const { accessory, setVolume } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    await bulb.getCharacteristic(C.Brightness).setHandler!(40)
    await bulb.getCharacteristic(C.On).setHandler!(false)
    await bulb.getCharacteristic(C.On).setHandler!(true)

    // Not full volume: on restores the 40 the user set, not the fixture's 80.
    expect(setVolume).toHaveBeenLastCalledWith(dingDong.id, 40)
  })

  it('remembers the audible level after rebuilding from a muted console echo', async () => {
    const { accessory, build, setVolume } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    await bulb.getCharacteristic(C.Brightness).setHandler!(40)
    await bulb.getCharacteristic(C.On).setHandler!(false)
    build({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 0, repeatTimes: 1 },
      ],
    })
    await bulb.getCharacteristic(C.On).setHandler!(true)
    expect(setVolume.mock.calls.map(([, volume]) => volume)).toEqual([40, 0, 40])
  })

  it('remembers an audible level changed directly in Protect', async () => {
    const { accessory, build, setVolume } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    build({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 70, repeatTimes: 1 },
      ],
    })
    await bulb.getCharacteristic(C.On).setHandler!(false)
    build({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 0, repeatTimes: 1 },
      ],
    })
    await bulb.getCharacteristic(C.On).setHandler!(true)
    expect(setVolume.mock.calls.map(([, volume]) => volume)).toEqual([0, 70])
  })

  it('reverts the tile when a write fails', async () => {
    const setVolume = vi.fn(async () => {
      throw new Error('console rejected it')
    })
    const { accessory } = setup(dingDong, { setVolume })
    const handler = accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.Brightness).setHandler!

    await expect(handler(30)).rejects.toBeInstanceOf(FakeHapStatusError)
    expect(log.warn).toHaveBeenCalled()
  })

  // HomeKit writes On and Brightness together when a slider is dragged on an off
  // tile. Two PATCHes raced and the On restore (100) could win over the 30.
  it('coalesces an On and Brightness write in the same tick into one volume update', async () => {
    const silent = {
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 0, repeatTimes: 1 },
      ],
    }
    const { accessory, setVolume } = setup(silent)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    await Promise.all([
      bulb.getCharacteristic(C.On).setHandler!(true),
      bulb.getCharacteristic(C.Brightness).setHandler!(30),
    ])

    expect(setVolume).toHaveBeenCalledTimes(1)
    expect(setVolume).toHaveBeenCalledWith(dingDong.id, 30)
    // The tile is corrected once HAP has committed the client's values.
    await new Promise(resolve => setImmediate(resolve))
    expect(bulb.valueOf_(C.On)).toBe(true)
    expect(bulb.valueOf_(C.Brightness)).toBe(30)
  })

  it('coalesces in either order', async () => {
    const { accessory, setVolume } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    await Promise.all([
      bulb.getCharacteristic(C.Brightness).setHandler!(25),
      bulb.getCharacteristic(C.On).setHandler!(true),
    ])

    expect(setVolume.mock.calls).toEqual([
      [dingDong.id, 25],
    ])
  })

  it('lets an Off in the same tick as a Brightness write silence the chime', async () => {
    const { accessory, setVolume } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    await Promise.all([
      bulb.getCharacteristic(C.On).setHandler!(false),
      bulb.getCharacteristic(C.Brightness).setHandler!(60),
    ])

    expect(setVolume.mock.calls).toEqual([
      [dingDong.id, 0],
    ])
  })

  // Real HAP stores the value the client wrote AFTER the set handler resolves,
  // which overwrites any correction made inside the handler. The tile must
  // still end on what the chime actually does.
  it.each([
    [
      'On with Brightness 0',
      true,
      0,
      false,
      0,
    ],
    [
      'Off with Brightness 60',
      false,
      60,
      false,
      0,
    ],
  ])('shows the real state after HAP commits %s', async (_name, onValue, brightnessValue, expectOn, expectBrightness) => {
    const { accessory } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    const on = bulb.getCharacteristic(C.On)
    const brightness = bulb.getCharacteristic(C.Brightness)
    const hapWrite = async (characteristic: typeof on, value: unknown) => {
      await characteristic.setHandler!(value)
      characteristic.value = value
    }

    await Promise.all([
      hapWrite(on, onValue),
      hapWrite(brightness, brightnessValue),
    ])
    await new Promise(resolve => setImmediate(resolve))

    expect(on.value).toBe(expectOn)
    expect(brightness.value).toBe(expectBrightness)
  })

  // Writes run concurrently through the request queue and can finish out of
  // order. The older one must not put its value back on the tile afterwards.
  it('keeps the newest write on the tile when an older write finishes last', async () => {
    const releases: (() => void)[] = []
    const { accessory } = setup(dingDong, {
      setVolume: () => new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    })
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    const brightness = bulb.getCharacteristic(C.Brightness)
    const tick = () => new Promise(resolve => setImmediate(resolve))

    const older = brightness.setHandler!(10) as Promise<void>
    await tick()
    const newer = brightness.setHandler!(70) as Promise<void>
    await tick()
    // Writes are sent one at a time, so the newer one waits for the older.
    expect(releases).toHaveLength(1)
    releases[0]!()
    await older
    brightness.value = 10
    await tick()
    expect(releases).toHaveLength(2)
    releases[1]!()
    await newer
    brightness.value = 70
    await tick()

    expect(bulb.valueOf_(C.Brightness)).toBe(70)
  })

  // A console update can land while a write is still in flight. When that
  // write's handler then resolves, HAP commits the client's value over it.
  it('restores a console update that landed while a write was in flight', async () => {
    let release!: () => void
    const { accessory, build } = setup(dingDong, {
      setVolume: () => new Promise<void>((resolve) => {
        release = resolve
      }),
    })
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    const brightness = bulb.getCharacteristic(C.Brightness)
    const tick = () => new Promise(resolve => setImmediate(resolve))

    const write = brightness.setHandler!(30) as Promise<void>
    await tick()
    build({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 45, repeatTimes: 1 },
      ],
    })
    release()
    await write
    brightness.value = 30
    await tick()

    expect(bulb.valueOf_(C.Brightness)).toBe(45)
  })

  it('keeps a console update that lands between a write and its tile correction', async () => {
    const { accessory, build } = setup(dingDong)
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    await bulb.getCharacteristic(C.Brightness).setHandler!(30)
    build({
      ...dingDong,
      ringSettings: [
        { cameraId: 'c', volume: 45, repeatTimes: 1 },
      ],
    })
    await new Promise(resolve => setImmediate(resolve))

    expect(bulb.valueOf_(C.Brightness)).toBe(45)
  })

  it('does not leave the tile stuck on No Response after a failed write', async () => {
    const { accessory } = setup(dingDong, {
      setVolume: async () => {
        throw new Error('console rejected it')
      },
    })
    const brightness = accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.Brightness)

    expect(await hapSet(brightness, 30)).toBe(-70402)
    await new Promise(resolve => setImmediate(resolve))

    expect(brightness.statusCode).toBe(0)
    expect(brightness.value).toBe(80)
  })

  // An unrelated device update (or a discovery that read the console before
  // the write landed) repeats the old volume. It is not news, and must not
  // undo a write the console then accepts.
  it('keeps a successful write when an update repeating the old volume lands mid-write', async () => {
    let release!: () => void
    const { accessory, build } = setup(dingDong, {
      setVolume: () => new Promise<void>((resolve) => {
        release = resolve
      }),
    })
    const brightness = accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.Brightness)
    const tick = () => new Promise(resolve => setImmediate(resolve))

    const write = hapSet(brightness, 30)
    await tick()
    build(dingDong)
    release()
    await write
    await tick()

    expect(brightness.value).toBe(30)
  })

  // Dragging the slider while the console is slow writes many values. Only
  // the newest needs to reach the console, after the one already in flight.
  it('collapses writes that arrive during an in-flight write into one', async () => {
    const releases: (() => void)[] = []
    const { accessory, setVolume } = setup(dingDong, {
      setVolume: () => new Promise<void>((resolve) => {
        releases.push(resolve)
      }),
    })
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!
    const brightness = bulb.getCharacteristic(C.Brightness)
    const tick = () => new Promise(resolve => setImmediate(resolve))

    const writes = [
      hapSet(brightness, 10),
    ]
    await tick()
    for (const value of [20, 30, 40]) {
      writes.push(hapSet(brightness, value))
      await tick()
    }
    // A later Off, then a later volume: the newest intent is the volume.
    writes.push(hapSet(bulb.getCharacteristic(C.On), false))
    await tick()
    writes.push(hapSet(brightness, 55))
    await tick()
    releases[0]!()
    await tick()
    releases[1]!()
    expect(await Promise.all(writes)).toEqual([0, 0, 0, 0, 0, 0])

    expect(setVolume.mock.calls.map(([, volume]) => volume)).toEqual([10, 55])
  })

  // HAP gives a set handler 9 s. A write that has already waited behind a slow
  // one cannot finish inside that with its own 7 s budget, so it fails fast
  // instead of reaching the console after HomeKit gave up on it.
  it('fails a queued write fast once it has waited past what HAP allows', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      let release!: () => void
      const { accessory, setVolume } = setup(dingDong, {
        setVolume: () => new Promise<void>((resolve) => {
          release = resolve
        }),
      })
      const brightness = accessory.getServiceById(S.Lightbulb, 'chime-volume')!.getCharacteristic(C.Brightness)
      const tick = () => new Promise(resolve => setImmediate(resolve))

      const first = hapSet(brightness, 10)
      await tick()
      const queued = hapSet(brightness, 70)
      await tick()
      now = 2_500
      release()

      expect(await first).toBe(0)
      expect(await queued).toBe(-70402)
      expect(setVolume).toHaveBeenCalledTimes(1)
    }
    finally {
      clock.mockRestore()
    }
  })

  it('rejects both coalesced writes when the single update fails', async () => {
    const setVolume = vi.fn(async () => {
      throw new Error('console rejected it')
    })
    const { accessory } = setup(dingDong, { setVolume })
    const bulb = accessory.getServiceById(S.Lightbulb, 'chime-volume')!

    const results = await Promise.allSettled([
      bulb.getCharacteristic(C.On).setHandler!(true),
      bulb.getCharacteristic(C.Brightness).setHandler!(30),
    ])

    expect(setVolume).toHaveBeenCalledTimes(1)
    for (const result of results) {
      expect(result.status).toBe('rejected')
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(FakeHapStatusError)
    }
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('writes no SerialNumber from a degraded payload', () => {
    const { accessory } = setup({ id: dingDong.id, name: 'Ding Dong' })
    expect(accessory.getServiceById(S.Lightbulb, 'chime-volume')).toBeDefined()
    expect(accessory.getService(S.AccessoryInformation)?.valueOf_(C.SerialNumber)).toBeUndefined()
  })
})
