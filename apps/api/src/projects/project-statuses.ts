/**
 * The lifecycle statuses a project can hold. Kept separate from board task
 * status types (statuses/status-defaults.ts) — a project's status describes
 * the project itself, not a column on the board.
 */
export const PROJECT_STATUSES = ['planned', 'started', 'completed', 'paused', 'canceled'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}
