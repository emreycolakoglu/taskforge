/**
 * Curated reaction emoji allowlist. Validated server-side and mirrored in
 * `apps/web/src/lib/reactions.ts`. Keep both lists in sync — they must match
 * exactly. ~14 entries: enough range for common reactions without a full
 * emoji-mart dependency. Expandable later.
 */
export const REACTION_EMOJIS = [
  '👍',
  '👎',
  '🎉',
  '🚀',
  '👀',
  '❤️',
  '🔥',
  '✅',
  '❌',
  '🙏',
  '💯',
  '⚡',
  '😄',
  '😕',
] as const;

export function isValidReaction(emoji: string): boolean {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}
