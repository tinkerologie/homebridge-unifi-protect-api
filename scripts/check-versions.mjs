import { readFileSync } from 'node:fs'
import process from 'node:process'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const version = manifest.version
if (typeof version !== 'string' || !version || version !== lock.version || version !== lock.packages?.['']?.version) {
  console.error('package.json and both package-lock.json root versions must agree.')
  process.exit(1)
}
console.log(`Package versions agree: ${version}`)
