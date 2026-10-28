import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const script = join(process.cwd(), 'scripts/gen-zod.mjs')
const document = readFileSync('spec/protect-7.3.70.openapi.json', 'utf8')

it.each(['unused', 'not-required'])('rejects a stale optional override (%s)', (mutation) => {
  const directory = mkdtempSync(join(tmpdir(), 'protect-gen-zod-'))
  try {
    const spec = JSON.parse(document)
    const ring = spec.components.schemas.ringSettings
    if (mutation === 'unused')
      delete ring.title
    else
      ring.required = ring.required.filter((field: string) => field !== 'ringtoneId')
    mkdirSync(join(directory, 'spec'))
    mkdirSync(join(directory, 'src/protect'), { recursive: true })
    writeFileSync(join(directory, 'spec/protect-7.3.70.openapi.json'), JSON.stringify(spec))
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('OPTIONAL_OVERRIDES entry ringSettings.ringtoneId')
    expect(result.stderr).toContain(mutation === 'unused' ? 'never applied' : 'no longer required')
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
