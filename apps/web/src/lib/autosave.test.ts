import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaver } from './autosave'

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves the latest value after the quiet delay', () => {
    const save = vi.fn()
    const saver = createAutosaver(save, { delayMs: 1000 })

    saver.schedule('a')
    saver.schedule('ab')
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(999)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('ab')
  })

  it('debounces: rapid schedules collapse into one save', () => {
    const save = vi.fn()
    const saver = createAutosaver(save, { delayMs: 1000 })

    saver.schedule('a')
    vi.advanceTimersByTime(500)
    saver.schedule('ab')
    vi.advanceTimersByTime(500)
    saver.schedule('abc')
    vi.advanceTimersByTime(1000)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('abc')
  })

  it('flush saves the pending value immediately and cancels the timer', () => {
    const save = vi.fn()
    const saver = createAutosaver(save, { delayMs: 1000 })

    saver.schedule('draft')
    saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('draft')

    // Timer must not fire a second time after a flush.
    vi.advanceTimersByTime(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush is a no-op when nothing is pending', () => {
    const save = vi.fn()
    const saver = createAutosaver(save, { delayMs: 1000 })

    saver.flush()
    expect(save).not.toHaveBeenCalled()

    saver.schedule('x')
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
    saver.flush() // already flushed by the timer
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel discards a pending save without firing', () => {
    const save = vi.fn()
    const saver = createAutosaver(save, { delayMs: 1000 })

    saver.schedule('gone')
    saver.cancel()
    vi.advanceTimersByTime(2000)
    expect(save).not.toHaveBeenCalled()
  })
})
