// test/queue.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtectAuthError, ProtectRateLimitError, ProtectUnavailableError } from '../src/protect/errors.js'
import { RequestQueue } from '../src/protect/queue.js'

describe('requestQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('never exceeds the configured concurrency', async () => {
    const queue = new RequestQueue({ concurrency: 2 })
    let active = 0
    let peak = 0
    const task = () => new Promise<void>((resolve) => {
      active++
      peak = Math.max(peak, active)
      setTimeout(() => {
        active--
        resolve()
      }, 10)
    })

    const all = Promise.all(Array.from({ length: 6 }, () => queue.run(task)))
    await vi.runAllTimersAsync()
    await all

    expect(peak).toBe(2)
  })

  it('retries a retryable failure with exponential backoff', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 3, baseDelayMs: 100 })
    let attempts = 0
    const task = async () => {
      attempts++
      if (attempts < 3)
        throw new ProtectUnavailableError('boom')
      return 'ok'
    }

    const promise = queue.run(task)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(attempts).toBe(3)
  })

  it('does not retry an auth error', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 3, baseDelayMs: 100 })
    let attempts = 0
    const task = async () => {
      attempts++
      throw new ProtectAuthError('bad key')
    }

    const promise = queue.run(task)
    // Attach the rejection assertion before the timers run so the promise
    // always has a handler by the time it settles — otherwise Node reports
    // an unhandled rejection despite the assertion itself passing.
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectAuthError)
    await vi.runAllTimersAsync()

    await assertion
    expect(attempts).toBe(1)
  })

  it('honours Retry-After from a rate limit error', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 2, baseDelayMs: 100 })
    let attempts = 0
    const task = async () => {
      attempts++
      if (attempts === 1)
        throw new ProtectRateLimitError('slow down', 5000)
      return 'ok'
    }

    const promise = queue.run(task)
    await vi.advanceTimersByTimeAsync(4999)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(2)
    await expect(promise).resolves.toBe('ok')
  })

  it('gives up after maxRetries and rejects with the last error', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 2, baseDelayMs: 10 })
    const task = async () => {
      throw new ProtectUnavailableError('always down')
    }

    const promise = queue.run(task)
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.runAllTimersAsync()

    await assertion
  })

  it('maxRetries: 0 means exactly one attempt, no retries', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 0, baseDelayMs: 10 })
    let attempts = 0
    const task = async () => {
      attempts++
      throw new ProtectUnavailableError('down')
    }

    const promise = queue.run(task)
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.runAllTimersAsync()

    await assertion
    expect(attempts).toBe(1)
  })

  it('runs tasks in submission order under contention', async () => {
    // concurrency: 1 makes this unambiguous — only one task can be active at
    // a time, so completion order can only match the FIFO `waiting` queue's
    // admission order, never scheduling/timer tie-breaks.
    const queue = new RequestQueue({ concurrency: 1 })
    const order: number[] = []
    const mkTask = (id: number, delayMs: number) => async () => {
      await new Promise<void>(resolve => setTimeout(resolve, delayMs))
      order.push(id)
    }

    // Delays deliberately out of step with submission order — if the queue
    // ever let a later, faster task cut ahead of an earlier, slower one that
    // is still waiting, this would catch it.
    const all = Promise.all([
      queue.run(mkTask(1, 15)),
      queue.run(mkTask(2, 5)),
      queue.run(mkTask(3, 10)),
      queue.run(mkTask(4, 1)),
      queue.run(mkTask(5, 1)),
    ])
    await vi.runAllTimersAsync()
    await all

    expect(order).toEqual([1, 2, 3, 4, 5])
  })
  it('caps retries per request below the queue default', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 3, baseDelayMs: 10 })
    let attempts = 0
    const promise = queue.run(async () => {
      attempts++
      throw new ProtectUnavailableError('down')
    }, { maxRetries: 1 })
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(2)
  })

  it('never raises retries above the queue default', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 0, baseDelayMs: 10 })
    let attempts = 0
    const promise = queue.run(async () => {
      attempts++
      throw new ProtectUnavailableError('down')
    }, { maxRetries: 5 })
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(1)
  })

  it('lets a request narrow which errors it retries', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 3, baseDelayMs: 10 })
    let attempts = 0
    const promise = queue.run(async () => {
      attempts++
      throw new ProtectUnavailableError('timed out')
    }, {
      retryable: error => error instanceof ProtectRateLimitError,
    })
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.runAllTimersAsync()
    await assertion
    expect(attempts).toBe(1)
  })

  it('releases the slot while a request backs off', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 1, baseDelayMs: 1000 })
    const order: string[] = []
    let attempts = 0
    const retrying = queue.run(async () => {
      attempts++
      order.push(`retrying-${attempts}`)
      if (attempts === 1)
        throw new ProtectUnavailableError('down')
    })
    const other = queue.run(async () => {
      order.push('other')
    })
    await vi.advanceTimersByTimeAsync(10)
    // The other request ran during the backoff, not after it.
    expect(order).toEqual(['retrying-1', 'other'])
    await vi.runAllTimersAsync()
    await Promise.all([retrying, other])
    expect(order).toEqual(['retrying-1', 'other', 'retrying-2'])
  })

  it('hands each attempt the time left in its deadline', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 0 })
    let seen: number | undefined
    await queue.run(async (remainingMs) => {
      seen = remainingMs
    }, { deadlineMs: 7000 })
    expect(seen).toBe(7000)
    let unbounded: number | undefined = 0
    await queue.run(async (remainingMs) => {
      unbounded = remainingMs
    })
    expect(unbounded).toBeUndefined()
  })

  it('fails a request whose deadline passes while it waits for a slot', async () => {
    const queue = new RequestQueue({ concurrency: 1 })
    const blocker = queue.run(() => new Promise<void>(resolve => setTimeout(resolve, 10_000)))
    const task = vi.fn(async () => 'ran')
    const late = queue.run(task, { deadlineMs: 2000 })
    const assertion = expect(late).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.advanceTimersByTimeAsync(2001)
    await assertion
    await vi.runAllTimersAsync()
    await blocker
    expect(task).not.toHaveBeenCalled()
    // The abandoned waiter did not swallow the slot.
    await expect(queue.run(async () => 'next')).resolves.toBe('next')
  })

  it('does not back off past its deadline', async () => {
    const queue = new RequestQueue({ concurrency: 1, maxRetries: 3, baseDelayMs: 5000 })
    let attempts = 0
    const promise = queue.run(async () => {
      attempts++
      throw new ProtectUnavailableError('down')
    }, { deadlineMs: 3000 })
    const assertion = expect(promise).rejects.toBeInstanceOf(ProtectUnavailableError)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
    expect(attempts).toBe(1)
  })
})
