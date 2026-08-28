# Comment Edits + Reactions (TFG-32)

Design spec for adding comment editing and emoji reactions to TaskForge.
Task: `[P0] Comment edits + reactions` (TFG-32).

## Context

Comments are the collaboration surface. Today you can't fix a typo without
deleting and re-posting, and reactions replace noise-comments ("+1", "ship
it", "LGTM"). This spec covers editing comment bodies and single-emoji
reactions.

### Scope

- **Edit:** `PATCH` a comment's body. No edit history — just `editedAt` + an
  "edited" indicator. No time limit on edits (matches Linear).
- **Reactions:** Single-emoji reactions, one per user per emoji per comment.
  No threaded replies.
- **Authz:** Author can edit own; admin can edit any; non-author non-admin → 403. Anonymous comments (authorId null) → admin only. Any authenticated
  user (including bot sessions) can react.
- **Activity:** `comment_edited` logged once per save. Reactions log nothing
  (too noisy).

### Decisions (resolved during brainstorming)

1. **Reaction API shape:** Toggle-only. `POST /api/comments/:id/reactions
{ emoji }` toggles on/off idempotently. MCP `comments_react { commentId,
emoji }` also toggles. No `remove` flag on either surface.
2. **Emoji set:** Curated allowlist (~12-16 common reactions). Backend
   validates against the list. Frontend picker renders a grid of those
   emojis. Expandable later.
3. **Edit time limit:** None. Author can edit forever; admin can edit any
   forever. The `editedAt` indicator is the only audit signal.

## Schema

```prisma
model Comment {
  // existing fields unchanged except:
  editedAt   DateTime?
  reactions  CommentReaction[]

  // existing relations…
}

model CommentReaction {
  id        String   @id @default(cuid())
  commentId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())

  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([commentId, userId, emoji])
  @@index([commentId])
  @@map("comment_reactions")
}
```

- `User` gains `reactions CommentReaction[]` relation.
- `editedAt` is set **only on the first edit** (`editedAt = now()` when
  currently null). Subsequent edits leave `editedAt` as-is, so the indicator
  persists and the timestamp marks _first_ edit (Linear behavior).
- The `@@unique([commentId, userId, emoji])` constraint makes toggle
  idempotent at the DB level: try insert; if it conflicts, delete instead.
- No backfill migration needed — `editedAt` defaults null and the
  `comment_reactions` table is new.

## API

### REST

Additions to `CommentsController` (`apps/api/src/comments/comments.controller.ts`):

| Method  | Path                          | Body                | Auth                            | Returns                            |
| ------- | ----------------------------- | ------------------- | ------------------------------- | ---------------------------------- |
| `PATCH` | `/api/comments/:id`           | `{ body: string }`  | author OR admin → 403 otherwise | updated comment (with `reactions`) |
| `POST`  | `/api/comments/:id/reactions` | `{ emoji: string }` | any authed user                 | `{ emoji, userIds: string[] }`     |

- `GET /api/comments/task/:taskId` — `findByTask` now includes `reactions`
  per comment, grouped as `{ emoji, userIds[] }[]`, ordered by emoji string
  ascending for stable display.
- Emoji validated server-side against `REACTION_EMOJIS` (curated list, ~12-16
  entries). 400 on unknown emoji.
- `PATCH` sets `editedAt = now()` only if currently null. Logs `Activity`
  with `action: 'comment_edited'` once per save.
- `POST /reactions`: if row `[commentId, userId, emoji]` exists → delete
  (toggle off); else create (toggle on). Returns the toggled reaction's new
  state `{ emoji, userIds: string[] }` — `userIds` is the full list after
  toggle (empty array on toggle-off, never absent). The codebase pattern is
  invalidate-on-event so the return is informational; the client refetches
  via the WS invalidation.

### MCP

Additions to `handleComments` (`apps/api/src/mcp/mcp.service.ts`):

| Tool              | Params                 | Behavior                                    |
| ----------------- | ---------------------- | ------------------------------------------- |
| `comments_update` | `{ id, body }`         | Same authz as REST; returns updated comment |
| `comments_react`  | `{ commentId, emoji }` | Toggles; returns `{ emoji, userIds[] }`     |

Both reuse `CommentsService` methods so logic isn't duplicated between REST
and MCP paths.

### Tool definitions

Add to `apps/api/src/mcp/tool-definitions.ts`:

```ts
{
  name: 'comments_update',
  title: 'Update comment',
  description: 'Edit a comment body. Only the author or an admin can edit.',
  inputSchema: { id: z.string(), body: z.string() },
},
{
  name: 'comments_react',
  title: 'Toggle reaction',
  description: 'Toggle an emoji reaction on a comment. Idempotent: reacting again removes it.',
  inputSchema: { commentId: z.string(), emoji: z.string() },
},
```

## WebSocket events

Two new events, both board-scoped (same as `comment:created`/`comment:deleted`):

| Event                      | Payload                                   | Scope                           |
| -------------------------- | ----------------------------------------- | ------------------------------- |
| `comment:updated`          | full updated comment (incl. `reactions`)  | `boardId` of the comment's task |
| `comment:reaction:toggled` | `{ commentId, emoji, userIds[], taskId }` | `boardId` of the comment's task |

`use-socket.ts` adds both to `eventTypes` and the invalidation block. Any
`comment:*` event invalidates `['comments', taskId]` + `['tasks', taskId]`.
The `comment:reaction:toggled` payload carries `taskId` so the invalidator
finds it. Reaction toggles invalidate (refetch) rather than optimistically
patch — consistent with the existing hooks.

## Frontend

### Types (`apps/web/src/types/index.ts`)

```ts
export interface CommentReaction {
  emoji: string;
  userIds: string[];
}

export interface Comment {
  // existing fields…
  editedAt?: string | null;
  reactions?: CommentReaction[];
}
```

### `detail-comments.tsx`

1. **Edited indicator** — next to timestamp: when `c.editedAt` is set,
   render `(edited)` in `text-muted-foreground`, font-mono, small. No
   tooltip in v1.

2. **Edit action** — in the existing three-dot `DropdownMenu` (currently
   only has Delete), add "Edit" above Delete. Visible under same authz as
   delete: author OR admin. Clicking switches that comment's body from the
   read-only `MarkdownEditor` to a `Textarea` + Save/Cancel buttons. Save →
   `updateComment.mutate({ id, body })`; Cancel restores. Enter submits,
   Shift+Enter newline (same as composer).

3. **Reaction row** — below each comment body:
   - Existing reactions as chips (`emoji count`, e.g. `👍 3`). Clicking a
     chip you've reacted on toggles off; clicking one you haven't toggles
     on.
   - A `+` (Smile icon from lucide) button opens a small Popover with the
     curated emoji grid; selecting one adds your reaction.
   - Chip styling: `border-border bg-muted text-muted-foreground`. Your own
     reaction highlighted with `border-primary/40` (subtle — not a Lime fill;
     reactions are not primary CTAs per design.md).

4. **`use-comments.ts`** — add `useUpdateComment` and `useReactToComment`
   mutations mirroring the existing `useCreateComment`/`useDeleteComment`
   pattern. On success: invalidate `['comments', taskId]`. No optimistic
   updates.

5. **`api.ts`** — add `comments.update(id, body)` → `PATCH /comments/:id`,
   `comments.react(id, emoji)` → `POST /comments/:id/reactions`.

6. **Emoji constant** — `REACTION_EMOJIS` defined in
   `apps/web/src/lib/reactions.ts` and `apps/api/src/comments/reactions.ts`.
   No shared package exists; two small constants kept in sync. ~12-16
   entries: 👍 👎 🎉 🚀 👀 ❤️ 🔥 ✅ ❌ 🙏 💯 ⚡ (final list in implementation).

### Design system compliance

- Reaction chips: `border-border bg-muted text-muted-foreground`, your own
  reaction `border-primary/40`. No Lime fill — reactions are content, not
  primary CTAs.
- Edit mode textarea reuses the composer `Textarea` (no new component).
- "edited" indicator uses font-mono per the timestamp convention.
- No new accent colors — emojis are content, not UI chrome.

## Public task page

The public task page (`public-task-page.tsx`) renders a curated comment
shape (`{ author, body, createdAt }`) — no `editedAt`, no `reactions`. The
`PublicService` hand-built `select` does **not** include `editedAt` or
reactions. Published tasks show comments read-only, so reactions and edit
indicators are intentionally absent from the public surface. No change
needed unless we want to expose reactions publicly later (out of scope).

## Testing

### API (Jest, integration — `comments.service.spec.ts`)

- `update`:
  - Author can edit own → body changes, `editedAt` set on first edit only
    (second edit keeps original `editedAt`).
  - Admin can edit any.
  - Non-author non-admin → 403.
  - Anonymous comment (authorId null) → only admin.
  - Logs `comment_edited` activity.
  - Emits `comment:updated` event.
- `react`:
  - Toggle on (creates row, returns `{ emoji, userIds: [userId] }`).
  - Toggle off (deletes row, returns `{ emoji, userIds: [] }`).
  - Idempotent — react twice = off.
  - Unknown emoji → 400.
  - Emits `comment:reaction:toggled` event.
  - Reactions don't create activity entries.
  - Bot session can react.
- `findByTask`: returns `reactions` grouped by emoji with `userIds[]`.

### MCP (`mcp.service.spec.ts`)

- `comments_update` — same authz path, returns updated comment.
- `comments_react` — toggle, unknown emoji 400.

### Web (Vitest)

- `detail-comments.test.tsx` — extend existing suite:
  - Edit button appears for author/admin; hidden for non-author non-admin.
  - Edit mode renders textarea + Save/Cancel; Save calls `onEdit`; Cancel
    restores.
  - `(edited)` indicator renders when `editedAt` set; absent otherwise.
  - Reaction chips render with counts; clicking a chip you've reacted on
    toggles off; `+` opens picker; selecting adds reaction.
- `api.test.ts` — `comments.update` makes PATCH; `comments.react` makes
  POST.
- `use-comments` hook tests — `useUpdateComment`, `useReactToComment`
  invalidate `['comments', taskId]` on success.
- `task-detail-page.test.tsx` — add `onEdit`/react hooks to the
  `use-comments` mock factory (or the suite breaks per the AGENTS.md
  gotcha on mock factories).

## Out of scope

- Edit history / version diff (v1 is `editedAt` indicator only).
- Threaded replies.
- Free-form emoji (curated allowlist only).
- Time-limited edit window.
- Reaction notifications / subscription auto-subscribe (that's TFG-33's
  @-mention work; reactions don't subscribe in v1).
- Public task page reactions.
- Optimistic cache patches (invalidation refetch, consistent with hooks).
