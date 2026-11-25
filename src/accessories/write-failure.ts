import type { API, Characteristic, HapStatusError } from 'homebridge'
import { setImmediate } from 'node:timers'

/**
 * The error a set handler throws when the console rejects a write, so HomeKit
 * puts the control back.
 *
 * HAP-NodeJS stores the thrown status on the characteristic. With no get
 * handler, it returns that status on every later read, and the tile shows
 * "No Response" until something updates the value. Only `updateValue` clears
 * it, so this writes the unchanged value back once HAP has sent its error
 * reply.
 */
export function writeFailure(api: API, characteristic: Characteristic): HapStatusError {
  setImmediate(() => characteristic.updateValue(characteristic.value))
  return new api.hap.HapStatusError(api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
}
