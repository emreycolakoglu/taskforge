# Saved Custom Views — Design

**Task:** TFG-30 · **Date:** 2026-08-31 · **Status:** Approved

Persist filter + group + sort combos on a board as named views. Personal views are visible only to their creator; shared views are visible to all board members and manageable by their owner or board admins. Active view is URL-addressable (`/board/:id?view=<id>`).

Out of scope (explicit): global cross-board views, views on the `/tasks` page, a per-board "default view" flag, view folders/projects, swimlanes (two-dimensional grouping).

## Architecture

**Approach A — client-side filtering, server-persisted views.** The board page loads all tasks as it does today; a pure `applyView()` function filters, groups, and sorts tasks before render. Views are rows in a new `View` Prisma model. No server-side filtered task endpoint — consistent with today's client-side label filtering, and unnecessary at SQLite/board scale. Server-side filtering can be layered in later without touching the View schema.

## Data model

```prisma
model View {
  id        String   @id @default(cuid())
  boardId   String
  userId    String?          // null = shared board view, set = personal
  name      String
  filters   String           // JSON string (SQLite has no Json type; same as Task.metadata)
  groupBy   String   @default("status")   // status | assignee | priority | label | none
  sortBy    String   @default("position") // position | priority | dueDate | title
  layout    String   @default("board")    // board | list
  position  Float    @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  owner User? @relation("ViewOwner", fields: [userId], references: [id], onDelete: Cascade)

  @@index([boardId])
  @@map("views")
}
```

Notes:

- `userId = null` → shared; set → personal. `boardId` is required (global views cut from scope).
- Name uniqueness is **not** DB-enforced (partial unique indexes are awkward with nullable userId in SQLite/Prisma). The service rejects duplicate names scoped to `{boardId, userId-or-null}` with 409.
- `owner` uses `onDelete: Cascade` (not SetNull) so a deleted user's personal views are removed rather than resurrected as shared views. A leaving owner does not affect shared views.
- Board deletion cascades to views.

## Filters payload

`filters` stores JSON of shape:

```ts
{
  labelIds: string[];
  assigneeIds: string[];
  priorities: ("low" | "medium" | "high" | "urgent")[];
  dueDateRange: { from?: string; to?: string }; // ISO dates
  searchQuery: string;
}
```

All keys optional/absent-able. DTOs validate with class-validator (`@IsIn` enums for groupBy/sortBy/layout/priorities; nested validation for filters, size-capped). The service round-trips filters through `JSON.parse`/`JSON.stringify` so stored values are clean.

## API

New `views` module in `apps/api/src/views/` (controller / service / module / service.spec / dto). All routes authenticated; reads unscoped like every other board read (global `AuthGuard` only).

| Route                            | Behavior                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/boards/:boardId/views` | Shared views (userId null) + caller's personal views, ordered by `position`.                                                                                                                                        |
| `POST /api/views`                | Create. `shared: true` requires board membership; personal requires auth only. Duplicate name in same scope → 409. Emits `view:created` for shared views (board room).                                              |
| `GET /api/views/:id`             | Personal views 404 for anyone but owner.                                                                                                                                                                            |
| `PATCH /api/views/:id`           | Personal: owner only. Shared: owner or board admin (`MembersService.isBoardAdmin`, same pattern as LabelsService; legacy-board fallback applies; global admins pass all gates). Emits `view:updated` (shared only). |
| `DELETE /api/views/:id`          | Same authorization as PATCH. Emits `view:deleted` (shared only).                                                                                                                                                    |

Create permission: any board member may create shared views; editing/deleting a shared view is owner-or-board-admin. Bot sessions (MCP) can create personal views; shared-view writes follow the same gate.

## MCP

`views_list`, `views_create`, `views_update`, `views_delete`:

1. Entries in `apps/api/src/mcp/tool-definitions.ts` (zod inputSchema).
2. `case 'views':` in `McpService.handleRequest` dispatch, `handleViews` delegating to `ViewsService`.
3. `ViewsModule` imported into `McpModule`.
4. Tool-count assertions in MCP specs bump 24 → 28.
5. `views_list` requires `boardId` (error otherwise — v1 is board-scoped only).

## Frontend

**New files:**

- `hooks/use-views.ts` — `useBoardViews(boardId)` (`['views', boardId]`), `useCreateView`, `useUpdateView`, `useDeleteView`; mutations invalidate + toast (sonner).
- `hooks/use-view-state.ts` — reads `?view=<id>` from `useSearchParams`, falls back to `use-board-view-state.ts` localStorage when unset; writes the active view id to the URL via `replace` (no history pollution).
- `components/view-selector.tsx` — dropdown in `BoardHeaderBar` next to the list/kanban toggle: "No view", personal/shared groups, rename & delete actions.
- `components/save-view-dialog.tsx` — enabled once ≥1 filter/group/sort deviates from default; fields: name, personal-or-shared radio (shared option only for board members; hidden on legacy boards → personal only).

**Modified files:**

- `kanban-board.tsx` — generalize `filterTask()` into pure `applyView(tasks, { groupBy, filters, sortBy })`: filtering (labels, assignee, priority, dueDateRange, searchQuery), grouping (columns by status/assignee/priority/label; no-value tasks → "No X" fallback column), sorting within each group. Drag-and-drop disabled when `groupBy !== 'status'` (status-grouped views keep drag = set status).
- `board-header-bar.tsx` — `ViewSelector` slot; the list/kanban `ToggleGroup` reflects the active view's `layout`, falling back to localStorage state with no active view.
- `filter-chips-bar.tsx` — assignee/priority/due chips. Chip edits while a view is active produce _unsaved_ state; header offers "Save changes to view" / "Save as new".
- `hooks/use-socket.ts` — add `view:created|updated|deleted` to `eventTypes` + `invalidateByEvent` (board events invalidate `['views', boardId]`). Personal-view changes don't need socket events: mutations invalidate locally, and the server only emits for shared views.

**Design system:** view selector is a `DropdownMenu` with `border-sidebar-border` edges; active entry `bg-accent` (Graphite rule), never Lime; the only Lime CTA is the Save-view confirm button. Conforms to `design.md`.

## Flows

- **Save:** apply filters via chips/controls → "Save as view" enabled → dialog → `POST /views` → toast → view active (`?view=<new id>`).
- **Open board:** read `?view=` → if valid for this board (shared or owned by me), apply its state. Missing/stale/deleted id → strip param, fall back to localStorage state.
- **Edit shared view:** owner/admin get editable chips; others see it read-only — editing chips immediately switches to unsaved "custom" state instead of overwriting a colleague's view.
- **Delete:** confirm dialog (shared views warn it affects all members). Deleting the active view clears the URL param and falls back to default state.

## Edge cases & errors

- Filters referencing deleted labels/assignees: `applyView` drops dangling ids at apply time (filters are plain id lists; no FK from View).
- Rename to an existing name in the same scope → 409 → toast.
- `groupBy=label` with no labels → "No label" column. `sortBy=dueDate`: tasks without due date sort last within their group.
- User deleted → their personal views cascade away; shared views unaffected.

## Testing

- **API** `views.service.spec.ts`: create/list/get/update/delete; personal-vs-shared visibility (personal 404s for others); gating (member can't edit a foreign shared view; non-member can't create shared; admin can); duplicate-name 409; events emitted for shared views only.
- **MCP**: tool count 24 → 28; one happy-path per action.
- **Web**: `apply-view.test.ts` (pure filter/group/sort, dangling ids, dueDate ordering); `views.test.ts` hook tests (mocked fetch); `view-selector.test.tsx` + `save-view-dialog.test.tsx` component tests; URL sync test (set / clear / stale fallback).
