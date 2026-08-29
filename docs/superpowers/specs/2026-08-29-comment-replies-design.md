# Comment Replies Design

Date: 2026-08-29
Status: Approved

## Goal

Allow comments on a task to be replied to, with **unlimited nesting**, across all
surfaces: REST API, web UI, MCP, and the public task page.

Decisions from brainstorming:

- **Unlimited nesting** — any comment can be a reply to any other.
- **Tombstone deletion** — deleting a comment with replies keeps the row as a
  placeholder; the thread structure survives.
- **Expand all, collapsible** — threads render expanded by default; a "N replies"
  toggle collapses any subtree.
- **All surfaces** — REST + web + MCP + public page.
- **No special reply notifications** — replies count as normal `commented`
  activity; task subscribers are notified as today.

## Data model

`Comment` gains two columns (Prisma migration):

- `parentId String?` + self-relation (`parent` / `replies`, Prisma default
  `SetNull` — unreachable in practice because deletes tombstone, never
  hard-delete).
- `deletedAt DateTime?` — tombstone marker.

## API

- `POST /api/comments` — `CreateCommentDto` gains optional `parentId`.
  Validation: parent must exist and belong to the same `taskId`; otherwise 400.
  Replying to a tombstoned comment is allowed.
- `GET /api/comments/task/:taskId` — same endpoint, now returns a **tree**:
  top-level comments ordered `createdAt desc`, replies within a thread ordered
  `createdAt asc` (oldest first), recursively nested in `replies[]`.
- `PATCH :id` / `DELETE :id` / `POST :id/reactions` — unchanged signatures.
  `DELETE` becomes a tombstone write (below). Edits are rejected on tombstoned
  comments.
- Events: reply creation emits the existing `comment:created` event (payload now
  carries `parentId`); board-scoping unchanged.

## Service behavior

- **Tree build:** one query fetches all comments for the task (plus reactions,
  as today); the service assembles the tree in memory (~20 lines): index by id,
  attach children to parents, return roots.
- **Create reply:** identical to comment creation plus `parentId`. Activity
  action stays `commented`; no extra notification logic.
- **Delete → tombstone:** instead of hard delete, set `deletedAt` and blank
  `body` to `''`. Keep `author` and the row so children's `parentId` still
  resolves. Activity log entry and `comment:deleted` event as today.
- **Reactions on tombstones:** left in the DB (not worth a purge query); the UI
  hides them.

## Web UI (`detail-comments.tsx`)

- `Comment` type gains `parentId`, `replies[]`, `deletedAt`. Hook signatures
  unchanged; the reply mutation is the same `POST /api/comments` with `parentId`,
  followed by the existing comments-query invalidation (the tree is re-fetched —
  no client-side tree surgery).
- **Rendering:** replies nest under their parent with left indent + subtle left
  border line (Graphite token), recursively. Any comment with children shows a
  `N replies` mono-font collapse/expand toggle; default expanded. Collapse state
  is a local `useState` set of collapsed ids.
- **Reply composer:** a small "Reply" ghost button on each comment (hover
  reveal, like the ⋯ menu) opens an inline `Textarea` + Submit/Cancel with the
  same Enter/Shift+Enter behavior as the main composer. Only one composer open
  at a time.
- **Tombstones:** rendered as muted mono "deleted" text — no body, no menu, no
  reactions row.
- **Header count:** counts visible (non-deleted) comments only; tombstones are
  shown but not counted.

## MCP

- `comments_create` gains optional `parentId` (same same-task validation); the
  inline comment logic in `mcp.service.ts` threads `parentId` through.
- `comments_list` returns the same nested tree shape as REST.
- Tool descriptions mention replying via `parentId`.

## Public task page

- `PublicService` returns comments in the nested tree shape.
- Tombstoned comments are **omitted** from the public payload; their replies are
  promoted to top level for display only.
- Public page renders the same nesting/collapse UI, read-only (no composer, no
  menus, no reactions).

## Testing

**API** (integration, real temp SQLite):

- Reply validation: parent from another task → 400; missing parent → 400.
- Tree ordering: mixed created dates, depth-3 nesting → correct nesting and
  ordering.
- Tombstone delete: children survive, `body` blanked, `deletedAt` set, activity
  - event emitted.
- Edit on tombstone → rejected.
- MCP `comments_create` with `parentId`; `comments_list` tree shape.

**Web** (component tests, mocked hooks):

- Thread rendering with nesting, collapse toggle behavior, tombstone display,
  reply composer open/submit flow.
