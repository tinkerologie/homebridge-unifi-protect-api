import type { AddressInfo } from 'node:net'
import type { Server } from 'node:tls'
import type { TestCert } from './support/tls.js'
import { createServer } from 'node:tls'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { consoleCertRequest } from '../homebridge-ui/server.js'
import { fetchConsoleCert, fingerprintOf } from '../src/protect/cert.js'
import { makeSelfSigned } from './support/tls.js'

/**
 * A real TLS listener, because the defect this guards was in the address
 * handed to `tls.connect`: `new URL('https://[::1]').hostname` keeps the
 * brackets, and the resolver cannot look up `[::1]`.
 */
describe('reading the console certificate', () => {
  let tls: TestCert
  let server: Server | undefined

  beforeAll(() => {
    tls = makeSelfSigned('unifi.local')
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server
      ? server.close(() => resolve())
      : resolve())
    server = undefined
  })

  async function listen(address: string): Promise<number> {
    server = createServer(tls)
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(0, address, () => resolve())
    })
    return (server.address() as AddressInfo).port
  }

  it('reads it from an IPv4 console', async () => {
    const port = await listen('127.0.0.1')
    const cert = await fetchConsoleCert(`127.0.0.1:${port}`)
    expect(cert.fingerprint).toBe(fingerprintOf(tls.cert))
  })

  it('reads it from a bracketed IPv6 console address', async () => {
    const port = await listen('::1')
    const cert = await fetchConsoleCert(`[::1]:${port}`)
    expect(cert.fingerprint).toBe(fingerprintOf(tls.cert))
  })

  it('reads it from a bracketed IPv6 console address in the settings UI', async () => {
    const port = await listen('::1')
    const result = await consoleCertRequest({ host: `[::1]:${port}` })
    expect(result.fingerprint).toBe(fingerprintOf(tls.cert))
    expect(result.matches).toBeNull()
  })
})
