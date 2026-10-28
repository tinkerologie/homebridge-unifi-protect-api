// test/settings.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { API_BASE_PATH, PLATFORM_NAME, PLUGIN_NAME } from '../src/settings.js'

describe('settings', () => {
  it('declares the Homebridge plugin and HAP transport for plugin discovery', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(manifest.keywords).toEqual(expect.arrayContaining(['homebridge-plugin', 'supports-hap']))
  })
  it('exposes the plugin identity used by Homebridge registration', () => {
    expect(PLATFORM_NAME).toBe('UniFiProtect')
    expect(PLUGIN_NAME).toBe('homebridge-unifi-protect-api')
  })

  it('points at the Protect Integration API, not the private API', () => {
    expect(API_BASE_PATH).toBe('/proxy/protect/integration')
  })
})
