import { describe, expect, it, vi } from 'vitest'
import { consoleCertRequest, discoverRequest, testConnectionRequest } from '../homebridge-ui/server.js'
import { fingerprintOf } from '../src/protect/cert.js'
import { makeSelfSigned } from './support/tls.js'

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Real certificates: fingerprints of made-up strings would collide trivially. */
const CERT_A = makeSelfSigned('console-a').cert
const CERT_B = makeSelfSigned('console-b').cert

/** Every handler that carries the key needs one — see the fail-closed test. */
const creds = { host: '10.0.0.1', apiKey: 'k', consoleCert: CERT_A }

describe('testConnectionRequest', () => {
  it('returns the protect version and nvr name', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/meta/info')
        ? ok({ applicationVersion: '7.2.105' })
        : ok({ id: 'n1', name: 'UDM-Pro' })) as never

    const result = await testConnectionRequest(creds, { fetchImpl })

    expect(result).toEqual({ version: '7.2.105', nvrName: 'UDM-Pro' })
  })

  it('pins every request to the trusted certificate', async () => {
    const fetchImpl = vi.fn(async () => ok({ applicationVersion: '7.2.105' })) as never

    await testConnectionRequest(creds, { fetchImpl })

    for (const [, init] of (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls)
      expect(init.consoleCert).toBe(CERT_A)
  })

  // The UI's half of the fail-closed rule: the key is not sent to a console
  // whose certificate has not been checked yet.
  it('refuses to send the api key before a certificate has been trusted', async () => {
    const fetchImpl = vi.fn() as never
    await expect(testConnectionRequest({ host: '10.0.0.1', apiKey: 'k' }, { fetchImpl }))
      .rejects
      .toThrow(/certificate has not been trusted/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('explains a rejected api key', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 })) as never
    await expect(testConnectionRequest({ ...creds, apiKey: 'bad' }, { fetchImpl })).rejects.toThrow(/API key/i)
  })

  it('explains an unreachable host differently from a bad key', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed'))) as never
    await expect(testConnectionRequest({ ...creds, host: '10.0.0.9' }, { fetchImpl })).rejects.toThrow(/could not reach/i)
  })

  it('blames the certificate, not the network, when the pin rejects the peer', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(Object.assign(new Error('nope'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }))) as never
    await expect(testConnectionRequest(creds, { fetchImpl })).rejects.toThrow(/certificate this plugin does not trust/i)
  })

  it('rejects an empty host without touching the network', async () => {
    const fetchImpl = vi.fn() as never
    await expect(testConnectionRequest({ ...creds, host: '' }, { fetchImpl })).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('consoleCertRequest', () => {
  const readCert = (pem: string) => vi.fn(async () => ({
    pem,
    fingerprint: fingerprintOf(pem),
  }))

  it('reports first use as neither a match nor a mismatch', async () => {
    const result = await consoleCertRequest({ host: '10.0.0.1' }, {
      readCert: readCert(CERT_A),
    })

    expect(result.matches).toBeNull()
    expect(result.trustedFingerprint).toBeNull()
    expect(result.fingerprint).toBe(fingerprintOf(CERT_A))
    expect(result.pem).toBe(CERT_A)
  })

  it('confirms a certificate that still matches', async () => {
    const result = await consoleCertRequest({ host: '10.0.0.1', consoleCert: CERT_A }, {
      readCert: readCert(CERT_A),
    })

    expect(result.matches).toBe(true)
  })

  // The UI stops here and never sends the key — see index.html.
  it('reports a changed certificate as a mismatch, with both fingerprints', async () => {
    const result = await consoleCertRequest({ host: '10.0.0.1', consoleCert: CERT_A }, {
      readCert: readCert(CERT_B),
    })

    expect(result.matches).toBe(false)
    expect(result.trustedFingerprint).toBe(fingerprintOf(CERT_A))
    expect(result.fingerprint).toBe(fingerprintOf(CERT_B))
  })

  it('rejects an empty host without touching the network', async () => {
    const read = readCert(CERT_A)
    await expect(consoleCertRequest({ host: '' }, { readCert: read })).rejects.toThrow()
    expect(read).not.toHaveBeenCalled()
  })
})

describe('discoverRequest', () => {
  it('returns capability flags so the UI cannot offer impossible settings', async () => {
    const cameras = [
      {
        id: 'cam1',
        name: 'Doorbell',
        modelKey: 'camera',
        hasPackageCamera: true,
        featureFlags: {
          hasSpeaker: true,
          hasMic: true,
          hasLedStatus: true,
          smartDetectTypes: ['person', 'package'],
        },
      },
    ]
    const fetchImpl = vi.fn(async (url: string) => ok(url.endsWith('/cameras')
      ? cameras
      : [])) as never

    const result = await discoverRequest(creds, { fetchImpl })

    expect(result.devices[0]).toEqual({
      id: 'cam1',
      name: 'Doorbell',
      type: 'camera',
      hasSpeaker: true,
      // Without this the audio toggle is never offered and nothing else notices.
      hasMic: true,
      hasLedStatus: true,
      hasPackageCamera: true,
      smartDetectTypes: ['person', 'package'],
    })
  })

  it('reports a missing microphone as false rather than undefined', async () => {
    const cameras = [
      {
        id: 'cam1',
        name: 'Sidegate',
        modelKey: 'camera',
        featureFlags: {},
      },
    ]
    const fetchImpl = vi.fn(async (url: string) => ok(url.endsWith('/cameras')
      ? cameras
      : [])) as never

    const result = await discoverRequest(creds, { fetchImpl })

    expect(result.devices[0]?.hasMic).toBe(false)
  })
})

describe('host validation', () => {
  const fetchFor = () => vi.fn(async () => ok({ applicationVersion: '7.2.105', name: 'UDM-Pro' }))

  it.each([
    '10.0.0.1',
    '10.0.0.1:7443',
    'udm.local',
    'UDM-Pro.example.com:443',
    '[fe80::1]',
    '[::1]:7443',
  ])('accepts %s', async (host) => {
    const fetchImpl = fetchFor()
    await testConnectionRequest({ ...creds, host }, { fetchImpl: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith(`https://${host}/proxy/protect/integration/v1/meta/info`, expect.anything())
  })

  it('trims surrounding whitespace before building the url', async () => {
    const fetchImpl = fetchFor()
    await testConnectionRequest({ ...creds, host: '  10.0.0.1  ' }, { fetchImpl: fetchImpl as never })
    expect(fetchImpl).toHaveBeenCalledWith('https://10.0.0.1/proxy/protect/integration/v1/meta/info', expect.anything())
  })

  it.each([
    '1.2.3.4/x#',
    '1.2.3.4/path',
    '1.2.3.4?q=1',
    '1.2.3.4#frag',
    'user:pass@1.2.3.4',
    'evil.com@10.0.0.1',
    'https://10.0.0.1',
    '10.0.0 .1',
    '10.0.0.1:0',
    '10.0.0.1:65536',
    '10.0.0.1:abc',
    '999.1.1.1',
    'fe80::1',
    '[fe80::1%en0]',
    '[not-ipv6]',
    '-bad.example.com',
    'a\r\nb',
  ])('rejects %j with a readable error, without touching the network', async (host) => {
    const fetchImpl = vi.fn()
    await expect(testConnectionRequest({ ...creds, host }, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/not a valid console address/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('validates the host before reading the certificate', async () => {
    const readCert = vi.fn()
    await expect(consoleCertRequest({ host: '1.2.3.4/x#' }, { readCert: readCert as never }))
      .rejects
      .toThrow(/not a valid console address/i)
    expect(readCert).not.toHaveBeenCalled()
  })

  it('reads the certificate of the trimmed host', async () => {
    const readCert = vi.fn(async () => ({
      pem: CERT_A,
      fingerprint: fingerprintOf(CERT_A),
    }))
    await consoleCertRequest({ host: ' [::1]:7443 ' }, { readCert })
    expect(readCert).toHaveBeenCalledWith('[::1]:7443')
  })
})

describe('credential validation', () => {
  it('rejects a missing api key without touching the network', async () => {
    const fetchImpl = vi.fn()
    await expect(testConnectionRequest({ ...creds, apiKey: '' }, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/enter the api key/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an api key with control characters without echoing it', async () => {
    const fetchImpl = vi.fn()
    const error = await testConnectionRequest({ ...creds, apiKey: 'secret\r\nX-Evil: 1' }, { fetchImpl: fetchImpl as never })
      .catch((e: Error) => e)
    expect(String((error as Error).message)).toMatch(/api key/i)
    expect(String((error as Error).message)).not.toContain('secret')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a trusted certificate that is not a string', async () => {
    const fetchImpl = vi.fn()
    await expect(testConnectionRequest({ ...creds, consoleCert: 42 as never }, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/certificate has not been trusted/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('response shape guards', () => {
  it('reports a non-list device response readably instead of a TypeError', async () => {
    const fetchImpl = vi.fn(async (url: string) => ok(url.endsWith('/cameras')
      ? null
      : []))
    await expect(discoverRequest(creds, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/unexpected response.*cameras/i)
  })

  it('reports an unexpected meta/info response readably', async () => {
    const fetchImpl = vi.fn(async () => ok(null))
    await expect(testConnectionRequest(creds, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/unexpected response/i)
  })

  it('reports a body that is not JSON readably', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>rebooting</html>', { status: 200 }))
    await expect(testConnectionRequest(creds, { fetchImpl: fetchImpl as never }))
      .rejects
      .toThrow(/unexpected response/i)
  })

  it('skips list entries that are not objects', async () => {
    const fetchImpl = vi.fn(async (url: string) => ok(url.endsWith('/lights')
      ? [
          null,
          { id: 'l1', name: 'Porch' },
        ]
      : []))
    const result = await discoverRequest(creds, { fetchImpl: fetchImpl as never })
    expect(result.devices.map(d => d.id)).toEqual(['l1'])
  })
})
