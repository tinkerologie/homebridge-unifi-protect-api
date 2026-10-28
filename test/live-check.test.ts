import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import { fingerprintOf } from '../src/protect/cert.js'
import { makeSelfSigned } from './support/tls.js'

it.each([
  [{ high: null, medium: null, low: null }, 0],
  [{ high: 'rtsps://localhost/stream', medium: null, low: null }, 0],
  [{ high: 42, medium: null, low: null }, 1],
  [{ high: 'https://localhost/stream', medium: null, low: null }, 1],
  [{ high: 'not-a-url', medium: null, low: null }, 1],
])('checks existing RTSPS streams without creating them (%j)', async (streams, status) => {
  const certificate = makeSelfSigned('localhost')
  const requests: string[] = []
  const server = createServer({ key: certificate.key, cert: certificate.cert }, (req, res) => {
    const url = new URL(req.url!, 'https://localhost')
    requests.push(`${req.method} ${url.pathname}${url.search}`)
    const endpoint = url.pathname.split('/integration/v1')[1]
    if (endpoint?.endsWith('/snapshot') && url.searchParams.has('highQuality')) {
      res.writeHead(400).end()
      return
    }
    const body = endpoint === '/meta/info'
      ? { applicationVersion: '7.3.70' }
      : endpoint === '/cameras'
        ? [{ id: 'test-camera' }]
        : endpoint === '/nvrs'
          ? { id: 'test-nvr' }
          : endpoint?.endsWith('/rtsps-stream')
            ? streams
            : []
    res.setHeader('Content-Type', endpoint?.endsWith('/snapshot') ? 'image/jpeg' : 'application/json')
    res.end(endpoint?.endsWith('/snapshot') ? 'x'.repeat(1024) : JSON.stringify(body))
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('error', () => {}))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const directory = mkdtempSync(join(tmpdir(), 'protect-live-check-'))
  try {
    const address = server.address() as { port: number }
    // No .env exists in this directory: process env must work on its own.
    const result = await new Promise<{ status: number | null, output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'scripts/live-check.mjs')], {
        cwd: directory,
        env: {
          ...process.env,
          PROTECT_HOST: `127.0.0.1:${address.port}`,
          PROTECT_API_KEY: 'test-only',
          PROTECT_CERT_SHA256: fingerprintOf(certificate.cert),
        },
      })
      let output = ''
      child.stdout.on('data', chunk => output += String(chunk))
      child.stderr.on('data', chunk => output += String(chunk))
      child.on('error', reject)
      child.on('close', code => resolve({ status: code, output }))
    })
    expect(result.status, result.output).toBe(status)
    expect(result.output).toContain(`${status ? 'FAIL' : 'PASS'}  rtsps-stream`)
    expect(requests).toContain('GET /proxy/protect/integration/v1/cameras/test-camera/rtsps-stream')
    expect(requests).toContain('GET /proxy/protect/integration/v1/cameras/test-camera/snapshot')
    expect(requests.every(request => request.startsWith('GET '))).toBe(true)
  }
  finally {
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>(resolve => sockets.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
