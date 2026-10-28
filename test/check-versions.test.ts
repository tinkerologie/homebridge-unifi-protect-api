import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/check-versions.mjs')

it.each([
  ['1.0.4', '1.0.4', 0],
  ['1.0.3', '1.0.4', 1],
  ['1.0.4', '1.0.3', 1],
  [undefined, '1.0.4', 1],
])('validates both lockfile versions (%s, %s)', (lockVersion, rootVersion, status) => {
  const directory = mkdtempSync(join(tmpdir(), 'protect-versions-'))
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.0.4' }))
    writeFileSync(join(directory, 'package-lock.json'), JSON.stringify({ version: lockVersion, packages: { '': { version: rootVersion } } }))
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    expect(result.status).toBe(status)
    expect(status ? result.stderr : result.stdout).toContain(status ? 'must agree' : '1.0.4')
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
