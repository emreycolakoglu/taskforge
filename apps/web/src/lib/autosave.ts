/**
 * Tiny debounced saver used by the always-live description editor.
 *
 * `schedule(value)` remembers the latest value and fires `save` after `delayMs`
 * of quiet. `flush()` fires any pending save immediately (used on blur/unmount
 * so no in-flight edit is dropped). `cancel()` discards a pending save without
 * firing. A value is only ever saved once per quiet period — repeated
 * `schedule` calls with the same latest value collapse into one save.
 *
 * Kept framework-free and injection-friendly (timer functions are parameters)
 * so it can be unit-tested with fake timers — see `autosave.test.ts`.
 */

export interface Autosaver<T> {
  schedule: (value: T) => void
  flush: () => void
  cancel: () => void
}

interface AutosaverOptions {
  delayMs: number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

export function createAutosaver<T>(
  save: (value: T) => void,
  { delayMs, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }: AutosaverOptions,
): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let hasPending = false
  let pendingValue: T

  const clear = () => {
    if (timer !== null) {
      clearTimeoutFn(timer)
      timer = null
    }
  }

  return {
    schedule(value: T) {
      pendingValue = value
      hasPending = true
      clear()
      timer = setTimeoutFn(() => {
        timer = null
        hasPending = false
        save(pendingValue)
      }, delayMs)
    },
    flush() {
      if (!hasPending) return
      clear()
      hasPending = false
      save(pendingValue)
    },
    cancel() {
      clear()
      hasPending = false
    },
  }
}
