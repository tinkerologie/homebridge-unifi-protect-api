import { isRetryable, ProtectRateLimitError, ProtectUnavailableError } from './errors.js'

export interface RequestQueueOptions {
  /** Maximum simultaneous in-flight tasks. The console returns 429 under burst load. */
  concurrency?: number
  maxRetries?: number
  baseDelayMs?: number
}

/** Per-request limits. Each one can only tighten the queue's own defaults. */
export interface RunPolicy {
  /** A CAP on the queue's `maxRetries`, never a raise: a test queue with 0 stays at 0. */
  maxRetries?: number
  /** Which errors this request may retry. Defaults to `isRetryable`. */
  retryable?: (error: unknown) => boolean
  /**
   * Total budget, from submission: queue wait, every attempt and every backoff.
   * HomeKit abandons a request on its own clock, so an answer after that clock
   * runs out is worthless and only keeps a slot from someone still waiting.
   */
  deadlineMs?: number
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Serialises access to the Protect console. Every request goes through here so a
 * burst throttles itself instead of tripping the rate limiter.
 */
export class RequestQueue {
  private readonly concurrency: number
  private readonly maxRetries: number
  private readonly baseDelayMs: number
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(options: RequestQueueOptions = {}) {
    this.concurrency = options.concurrency ?? 4
    this.maxRetries = options.maxRetries ?? 3
    this.baseDelayMs = options.baseDelayMs ?? 500
  }

  /**
   * Runs `task`, retrying per the policy. The task is handed the milliseconds
   * left in its deadline (undefined when it has none) so it can bound its own
   * transport timeout to it.
   *
   * The slot is held only while an attempt is ON THE WIRE, and released for the
   * backoff in between. A sleeping retry does no work, and holding its slot used
   * to park a HomeKit write behind up to a minute of somebody else's snapshot
   * backoff — long enough for HAP to give up and show No Response. The cost is
   * that a retry rejoins at the back of the queue instead of keeping its place.
   */
  async run<T>(task: (remainingMs: number | undefined) => Promise<T>, policy: RunPolicy = {}): Promise<T> {
    const deadline = policy.deadlineMs === undefined
      ? undefined
      : performance.now() + policy.deadlineMs
    const remaining = () => deadline === undefined
      ? undefined
      : Math.max(0, deadline - performance.now())
    const maxRetries = Math.min(this.maxRetries, policy.maxRetries ?? Number.POSITIVE_INFINITY)
    const retryable = policy.retryable ?? isRetryable

    let lastError: unknown
    for (let attempt = 0; ; attempt++) {
      // Timer slack can end a backoff at or past the deadline. A request with
      // no time left must not reach the wire, free slot or not: for a PATCH
      // that would be a duplicate write HomeKit has already abandoned.
      if (attempt > 0 && remaining() === 0)
        throw lastError
      try {
        await this.acquire(remaining())
      }
      catch (timedOut) {
        // A retry that runs out of time in the line still failed because of
        // its first error; the caller needs that, not a generic queue timeout.
        throw attempt > 0
          ? lastError
          : timedOut
      }
      let error: unknown
      try {
        // Checked again with the slot in hand: a waiter can be handed a slot
        // by release() after its deadline passed but before its own timer
        // fired. The finally below gives that slot straight back.
        const left = remaining()
        if (left === 0) {
          throw attempt > 0
            ? lastError
            : new ProtectUnavailableError('Timed out waiting for the console: the request deadline passed before it could be sent.')
        }
        return await task(left)
      }
      catch (caught) {
        error = caught
      }
      finally {
        this.release()
      }
      lastError = error
      if (!retryable(error) || attempt >= maxRetries)
        throw error
      const serverDelay = error instanceof ProtectRateLimitError
        ? error.retryAfterMs
        : undefined
      const delay = serverDelay ?? this.baseDelayMs * 2 ** attempt
      const left = remaining()
      // A retry that could only start after the deadline is a guaranteed miss.
      if (left !== undefined && delay >= left)
        throw error
      await sleep(delay)
    }
  }

  /** Resolves with a slot, or rejects once `withinMs` passes without one. */
  private async acquire(withinMs: number | undefined): Promise<void> {
    // Checked before the free-slot path: a spent deadline gets no slot at all.
    if (withinMs !== undefined && withinMs <= 0)
      throw new ProtectUnavailableError('Timed out waiting for the console: the request deadline passed before it could be sent.')
    if (this.active < this.concurrency) {
      this.active++
      return
    }
    // Handed a slot directly by release() below — active is already
    // accounted for, so no increment here. Incrementing again would
    // let a fresh acquire() steal the slot in the gap between
    // release()'s decrement and this continuation running.
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const waiter = () => {
        clearTimeout(timer)
        resolve()
      }
      this.waiting.push(waiter)
      if (withinMs === undefined)
        return
      timer = setTimeout(() => {
        // Removed from the line before rejecting, so release() can never hand
        // a slot to a request that has already given up — that slot would be
        // lost for good. Always still in the line here: a waiter handed a slot
        // clears this timer before it can fire.
        this.waiting.splice(this.waiting.indexOf(waiter), 1)
        reject(new ProtectUnavailableError('Timed out waiting for the console: too many requests are already in flight.'))
      }, withinMs)
    })
  }

  private release(): void {
    // Hand the freed slot directly to the next waiter instead of
    // decrementing-then-waking: decrementing first leaves a window,
    // between the decrement and the waiter's continuation actually
    // running (a separate microtask tick), during which a brand-new
    // acquire() call could see room and steal the slot that was meant
    // for the waiter — pushing active above `concurrency`.
    const next = this.waiting.shift()
    if (next) {
      next()
      return
    }
    this.active--
  }
}
