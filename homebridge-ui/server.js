import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { isIPv4, isIPv6 } from 'node:net'
import process from 'node:process'
import { connect } from 'node:tls'
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils'

const fail = message => new RequestError(message, {})

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
const BRACKETED = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i
const PLAIN = /^([^:[\]]+)(?::(\d{1,5}))?$/

/**
 * The console address as typed, trimmed and checked to be ONLY a host: a
 * hostname, an IPv4 address or a bracketed IPv6 address, with an optional
 * port. It is interpolated into a URL that carries the API key, so anything
 * else - a path, query, fragment, credentials or whitespace - would change
 * where that request goes (`1.2.3.4/x#` drops the API path entirely).
 */
function consoleHost(host) {
  const trimmed = typeof host === 'string'
    ? host.trim()
    : ''
  if (!trimmed)
    throw fail('Enter the IP address or hostname of your UniFi console.')
  const invalid = () => fail('That is not a valid console address. Enter only the IP address or hostname of your UniFi console (for example 192.168.1.1 or unifi.local), optionally with a port, and no https://, path or slashes. Put an IPv6 address in brackets, like [fd00::1].')

  const bracketed = BRACKETED.exec(trimmed)
  const plain = bracketed
    ? null
    : PLAIN.exec(trimmed)
  const name = bracketed?.[1] ?? plain?.[1]
  const port = bracketed?.[2] ?? plain?.[2]
  if (name === undefined)
    throw invalid()
  const validName = bracketed
    ? isIPv6(name)
    // An all-numeric name is only ever meant as an IPv4 address - do not let
    // `999.1.1.1` through as a "hostname".
    : /^[\d.]+$/.test(name)
      ? isIPv4(name)
      : HOSTNAME.test(name)
  if (!validName || (port !== undefined && !(Number(port) >= 1 && Number(port) <= 65_535)))
    throw invalid()
  return trimmed
}

function baseUrl(host) {
  return `https://${consoleHost(host)}/proxy/protect/integration/v1`
}

/**
 * Pins a connection to one certificate. Mirrors `pinnedTlsOptions` in
 * src/protect/cert.ts - read the long comment there before touching this.
 * `checkServerIdentity` replaces the hostname check ONLY (the cert is issued
 * for the UDM hostname, not the IP) and is NOT a no-op: it re-verifies identity
 * by comparing the presented leaf against the trusted certificate byte for
 * byte, so certificate identity stays fully enforced.
 *
 * ponytail: duplicated rather than imported from ../dist/, for the same
 * reason httpsFetch below is - server.js is plain JS loaded outside the TS
 * build. Both copies are a handful of lines and are covered by tests; collapse
 * them only if the UI ever gains a build step.
 */
function pinned(pem) {
  const trusted = Buffer.from(pem.replace(/-----[^-]*-----/g, '').replace(/\s+/g, ''), 'base64')
  return {
    rejectUnauthorized: true,
    ca: [pem],
    checkServerIdentity: (_host, cert) => cert.raw.equals(trusted)
      ? undefined
      : Object.assign(new Error('The UniFi console presented a certificate that does not match the pinned one.'), { code: 'ERR_TLS_CERT_PIN_MISMATCH' }),
  }
}

function fingerprintOf(pem) {
  const der = Buffer.from(pem.replace(/-----[^-]*-----/g, '').replace(/\s+/g, ''), 'base64')
  return createHash('sha256').update(der).digest('hex').toUpperCase().replace(/..(?!$)/g, '$&:')
}

/**
 * Reads the certificate the console presents. Sends nothing - no headers, no
 * API key - and drops the socket the moment the certificate is in hand, so it
 * is safe to run against a peer that has not been trusted yet.
 */
function readConsoleCert(host) {
  const url = new URL(`https://${host}`)
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: url.hostname,
      port: Number(url.port || 443),
      rejectUnauthorized: false,
    }, () => {
      const raw = socket.getPeerCertificate().raw
      socket.destroy()
      if (!raw?.length) {
        reject(new Error('the console presented no certificate'))
        return
      }
      const pem = `-----BEGIN CERTIFICATE-----\n${raw.toString('base64').replace(/.{1,64}/g, '$&\n')}-----END CERTIFICATE-----\n`
      resolve({
        pem,
        fingerprint: fingerprintOf(pem),
      })
    })
    socket.setTimeout(15_000, () => socket.destroy(new Error('timed out reading the certificate')))
    socket.on('error', reject)
  })
}

/**
 * Minimal fetch-shaped wrapper over node:https, pinned to the console's
 * certificate.
 *
 * `fetch` is deliberately not used: it cannot be given a custom trust anchor
 * in node without an undici dispatcher, and silently ignores an `agent`
 * option - the console's self-signed cert makes that a hard blocker (the
 * same reasoning behind src/protect/http.ts). This is inlined rather than
 * imported from ../dist/ because server.js is plain JS loaded outside the TS
 * build, and the shim needed here is a handful of lines - not worth coupling
 * the UI server to build output existing/being current.
 */
function httpsFetch(url, { headers, consoleCert } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      headers,
      ...pinned(consoleCert),
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const status = res.statusCode ?? 0
        resolve({
          status,
          ok: status >= 200 && status < 300,
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'),
        })
      })
      res.on('error', reject)
    })
    req.setTimeout(15_000, () => req.destroy(new Error('Request timed out')))
    req.on('error', reject)
    req.end()
  })
}

async function get(path, payload, deps) {
  const { apiKey, consoleCert } = payload
  // Resolved before the network attempt, so a missing or malformed host fails
  // without ever touching fetchImpl. Every message below interpolates this
  // validated value, never the raw input.
  const host = consoleHost(payload.host)
  const url = `${baseUrl(host)}${path}`
  const fetchImpl = deps?.fetchImpl ?? httpsFetch
  // Fail closed: the request below carries the API key, so it is not made at
  // all until the browser has trusted a certificate for this console.
  if (typeof consoleCert !== 'string' || !consoleCert)
    throw fail('The console\'s certificate has not been trusted yet. Press Test Connection to check it first.')
  // Checked here rather than left to node's header validation, whose error
  // would surface as "could not reach". The key itself is never echoed.
  if (typeof apiKey !== 'string' || !apiKey)
    throw fail('Enter the API key from UniFi Site Manager → Integrations.')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(apiKey))
    throw fail('That API key contains invalid characters. Paste it again from UniFi Site Manager → Integrations.')

  let response
  try {
    // Never log apiKey - it is sent only as the X-API-KEY header value.
    response = await fetchImpl(url, {
      headers: { 'X-API-KEY': apiKey },
      consoleCert,
    })
  }
  catch (error) {
    // A certificate error here means the pin rejected the peer during the
    // handshake - the key was never written to the socket. Say so, rather than
    // blaming the network.
    if (typeof error?.code === 'string' && error.code.includes('CERT'))
      throw fail(`${host} presented a certificate this plugin does not trust, so the API key was not sent. Check the fingerprint below.`)
    throw fail(`Could not reach ${host}. Check the address, and that the console is on and reachable from Homebridge.`)
  }

  if (response.status === 401 || response.status === 403)
    throw fail('That API key was rejected. Create one in UniFi Site Manager → Integrations, and make sure it has Protect access.')
  if (response.status === 404)
    throw fail(`${host} responded, but the Protect Integration API is not there. Check that UniFi Protect is installed and up to date.`)
  if (!response.ok)
    throw fail(`The console returned ${response.status}. Try again shortly.`)
  try {
    return await response.json()
  }
  catch {
    throw unexpected(path)
  }
}

/** For a console that answered with something other than what the API documents - often one mid-reboot. */
function unexpected(path) {
  return fail(`The console sent an unexpected response for ${path}. It may still be starting up - try again shortly.`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getRecord(path, payload, deps) {
  const body = await get(path, payload, deps)
  if (!isRecord(body))
    throw unexpected(path)
  return body
}

async function getList(path, payload, deps) {
  const body = await get(path, payload, deps)
  if (!Array.isArray(body))
    throw unexpected(path)
  return body.filter(isRecord)
}

/**
 * Reports what certificate the console is presenting and whether it matches the
 * one already trusted. The browser calls this BEFORE anything that carries the
 * API key, so a mismatch is caught with the credential still unsent.
 */
export async function consoleCertRequest(payload = {}, deps) {
  const { consoleCert } = payload
  const host = consoleHost(payload.host)
  const read = deps?.readCert ?? readConsoleCert

  let presented
  try {
    presented = await read(host)
  }
  catch (error) {
    throw fail(`Could not read the certificate of ${host} (${error?.message ?? error}). Check the address, and that the console is on and reachable from Homebridge.`)
  }

  const trustedFingerprint = typeof consoleCert === 'string' && consoleCert
    ? fingerprintOf(consoleCert)
    : null
  return {
    pem: presented.pem,
    fingerprint: presented.fingerprint,
    trustedFingerprint,
    // `null` where nothing is trusted yet - the UI treats that as first use,
    // which is a different thing from a mismatch.
    matches: trustedFingerprint === null
      ? null
      : trustedFingerprint === presented.fingerprint,
  }
}

export async function testConnectionRequest(payload = {}, deps) {
  const info = await getRecord('/meta/info', payload, deps)
  const nvr = await get('/nvrs', payload, deps)
  return {
    version: typeof info.applicationVersion === 'string'
      ? info.applicationVersion
      : 'unknown',
    nvrName: isRecord(nvr) && typeof nvr.name === 'string'
      ? nvr.name
      : 'UniFi Protect',
  }
}

export async function discoverRequest(payload = {}, deps) {
  const [cameras, lights, sensors, chimes] = await Promise.all([
    getList('/cameras', payload, deps),
    getList('/lights', payload, deps),
    getList('/sensors', payload, deps),
    getList('/chimes', payload, deps),
  ])

  const slim = (device, type) => ({
    id: device.id,
    name: device.name,
    type,
    hasSpeaker: device.featureFlags?.hasSpeaker ?? false,
    // Capability-driven UI: the audio toggle is only offered for a camera that
    // actually has a microphone.
    hasMic: device.featureFlags?.hasMic ?? false,
    hasLedStatus: device.featureFlags?.hasLedStatus ?? false,
    hasPackageCamera: device.hasPackageCamera ?? false,
    smartDetectTypes: device.featureFlags?.smartDetectTypes ?? [],
  })

  return {
    devices: [
      ...cameras.map(d => slim(d, 'camera')),
      ...lights.map(d => slim(d, 'light')),
      ...sensors.map(d => slim(d, 'sensor')),
      ...chimes.map(d => slim(d, 'chime')),
    ],
  }
}

class UiServer extends HomebridgePluginUiServer {
  constructor() {
    super()
    this.onRequest('/console-cert', payload => consoleCertRequest(payload))
    this.onRequest('/test-connection', payload => testConnectionRequest(payload))
    this.onRequest('/discover', payload => discoverRequest(payload))
    this.ready()
  }
}

// Only start a server when spawned by Homebridge (a child process talking
// over IPC), never on a plain module import - that's how the test suite
// loads these handlers directly.
if (process.send && process.env.NODE_ENV !== 'test')
  void new UiServer()
