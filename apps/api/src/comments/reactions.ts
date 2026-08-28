import type { PrismaClient } from '@prisma/client';

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

export interface GroupedReaction {
  emoji: string;
  userIds: string[];
}

const reactionLocks = new Map<string, Promise<void>>();

export function isValidReaction(emoji: string): boolean {
  return (REACTION_EMOJIS as readonly string[]).includes(emoji);
}

export function groupReactions(rows: { userId: string; emoji: string }[]): GroupedReaction[] {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const userIds = map.get(row.emoji);
    if (userIds) userIds.push(row.userId);
    else map.set(row.emoji, [row.userId]);
  }
  return Array.from(map.entries())
    .map(([emoji, userIds]) => ({ emoji, userIds }))
    .sort((a, b) => (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0));
}

function isReactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: string }).code;
  return code === 'P2002' || code === 'P2025';
}

async function withReactionLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = reactionLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  reactionLocks.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (reactionLocks.get(key) === current) reactionLocks.delete(key);
  }
}

export async function toggleCommentReaction(
  prisma: Pick<PrismaClient, 'commentReaction'>,
  commentId: string,
  userId: string,
  emoji: string,
): Promise<GroupedReaction> {
  const key = `${commentId}:${userId}:${emoji}`;

  return withReactionLock(key, async () => {
    let toggled = false;
    while (!toggled) {
      const existing = await prisma.commentReaction.findUnique({
        where: { commentId_userId_emoji: { commentId, userId, emoji } },
      });

      try {
        if (existing) {
          await prisma.commentReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.commentReaction.create({ data: { commentId, userId, emoji } });
        }
        toggled = true;
      } catch (error) {
        if (!isReactionConflict(error)) throw error;
      }
    }

    const rows = await prisma.commentReaction.findMany({
      where: { commentId, emoji },
      select: { userId: true, emoji: true },
    });
    return (
      groupReactions(rows).find((reaction) => reaction.emoji === emoji) ?? {
        emoji,
        userIds: [],
      }
    );
  });
}
