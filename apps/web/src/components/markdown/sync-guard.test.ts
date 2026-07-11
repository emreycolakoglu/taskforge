import { describe, it, expect } from 'vitest'
import { shouldSyncExternalValue } from './sync-guard'

describe('shouldSyncExternalValue', () => {
  it('never syncs while the editor is focused (protects the caret)', () => {
    expect(
      shouldSyncExternalValue({ isFocused: true, current: 'a', incoming: 'b' }),
    ).toBe(false)
  })

  it('syncs a differing external value when not focused', () => {
    expect(
      shouldSyncExternalValue({ isFocused: false, current: 'a', incoming: 'b' }),
    ).toBe(true)
  })

  it('does not sync when the value is unchanged (avoids update loops)', () => {
    expect(
      shouldSyncExternalValue({ isFocused: false, current: 'same', incoming: 'same' }),
    ).toBe(false)
  })
})
