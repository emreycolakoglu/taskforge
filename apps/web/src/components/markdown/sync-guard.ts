/**
 * Remote-update guard decision for the always-live editor.
 *
 * Pulled out of the React component so the branch is unit-testable without
 * mounting ProseMirror. Returns true only when an incoming external `value`
 * should overwrite the editor's current content: never while the user is
 * focused (would clobber the caret), and only when it actually differs.
 */
export function shouldSyncExternalValue(params: {
  isFocused: boolean
  current: string
  incoming: string
}): boolean {
  const { isFocused, current, incoming } = params
  if (isFocused) return false
  return current !== incoming
}
