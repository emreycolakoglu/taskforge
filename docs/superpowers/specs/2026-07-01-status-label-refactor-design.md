# Status / Label Refactor — Design

**Date:** 2026-07-01
**Status:** Approved, pending implementation plan
**Scope:** Rename the kanban-column concept "List" → "Status", remove the separate `Task.status` (active/done/archived) field, mark one status per board as the special "Done" column, and stamp a `doneAt` timestamp on tasks that enter it. Labels are untouched. The view/filter UI that consumes `doneAt` is out of scope — this refactor only lays the data foundation.

## Problem

The current model conflates two "status" concepts:

1. **`List`** — board-scoped, ordered, colored columns shown on the Kanban board. Each task belongs to exactly one `List`. The UI calls these "lists".
2. **`Task.status`** — a separate enum field (`active | done | archived`) shown in task detail via `DetailStatusSelect`. Used in ~15 places across `tasks.service`, `boards.service`, `mcp.service`, `relations.service`, and `notifications.service` to hide archived/done tasks from the board.

This is confusing: "status" should mean the column the task is in, not a hidden archive flag. The Kanban columns *are* the statuses.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Fate of `Task.status` (active/done/archived) | **Remove entirely.** Fold into statuses — the column is the status. No archiving mechanism. |
| How to know which tasks are hidden/archived | **No archiving.** Every task is always visible on its status column. |
| Status set | **Per-board, customizable.** Like today's lists; new boards get a default set. |
| Labels | **Keep as-is.** Label + TaskLabel many-to-many model untouched. |
| How to identify the Done status | **`Status.isDone: boolean`.** Exactly one per board. |
| Done timestamp source | **`Task.doneAt: DateTime?`**, stamped on move-in, cleared on move-out. |

## Data Model

### `Status` model (renamed from `List`)

```
model Status {
  id        String   @id @default(cuid())
  boardId   String
  name      String
  position  Float
  color     String?  @default("#6366f1")
  wipLimit  Int?
  isDone    Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board  Board   @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks  Task[]
}
```

- Same fields as the old `List`, plus `isDone`.
- `isDone` uniqueness is enforced in `StatusesService` (application-level): at most one status per board may have `isDone = true`. SQLite partial unique indexes have limited support across Prisma versions, so enforcement lives in the service. Two operations: `toggleDone(boardId, statusId)` atomically unsets `isDone` on all other board statuses and sets it on `statusId` (stamping `doneAt` on `statusId`'s tasks, clearing `doneAt` on the previous Done status's tasks); `unsetDone(boardId)` clears `isDone` and `doneAt` on the current Done status (board then has no Done column).

### `Task` model

```
model Task {
  id          String    @id @default(cuid())
  statusId    String       // was: listId
  boardId     String
  number      Int
  title       String
  description String?
  position    Float
  priority    String    @default("medium")
  doneAt      DateTime?    // new; null unless task is in an isDone status
  dueDate     DateTime?
  assigneeId  String?
  metadata    String?
  parentId    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  status  Status  @relation(fields: [statusId], references: [id], onDelete: Cascade)
  board   Board   @relation(fields: [boardId], references: [id], onDelete: Cascade)
  // ...other relations unchanged
}
```

- `Task.listId` → `Task.statusId`.
- `Task.status` (the `active | done | archived` string) is **dropped**.
- `Task.doneAt` is added: nullable timestamp.
- The `Task.list` relation → `Task.status`.

### `Board` model

- `Board.lists` relation → `Board.statuses`.

### Migration

Single Prisma migration:

1. `ALTER TABLE lists RENAME TO statuses;`
2. `ALTER TABLE tasks RENAME COLUMN listId TO statusId;`
3. Add `isDone` column to `statuses` (boolean, default false).
4. Drop `status` column from `tasks` and add `doneAt` column. SQLite can't drop columns directly in older versions; Prisma generates the temp-table rebuild. After rebuild, the new `tasks` table has `doneAt` and no `status`.

After migration runs, a data backfill step (in the migration's SQL or a one-shot script) sets `isDone = true` on the status named "Done" in each board that has one, and stamps `doneAt = updatedAt` on tasks currently in those "Done" statuses. Tasks in non-Done statuses get `doneAt = null`. This preserves approximate done-times from existing data using `updatedAt` as the best available proxy.

## API Changes (NestJS)

### `lists` module → `statuses` module

- Rename directory `apps/api/src/lists/` → `apps/api/src/statuses/`.
- `ListsService` → `StatusesService`, `ListsController` → `StatusesController`, `ListsModule` → `StatusesModule`.
- Files: `statuses.service.ts`, `statuses.controller.ts`, `statuses.module.ts`, `statuses.service.spec.ts`, `dto/status.dto.ts`.
- REST route: `api/lists` → `api/statuses`. Endpoints: `GET board/:boardId`, `GET :id`, `POST`, `PUT :id`, `PUT reorder`, `DELETE :id`, `POST :id/toggle-done`, `POST board/:boardId/unset-done`.
- Event names: `list:created` → `status:created`, `list:updated` → `status:updated`, `list:reordered` → `status:reordered`, `list:deleted` → `status:deleted`.
- DTOs: `CreateListDto` → `CreateStatusDto`, `UpdateListDto` → `UpdateStatusDto`, `ReorderListsDto` → `ReorderStatusesDto`. Fields unchanged plus optional `isDone` on create/update.

### `StatusesService` new method: `toggleDone`

```
async toggleDone(boardId: string, statusId: string, user?): Promise<Status>
```

- Sets `isDone = false` on all other statuses in `boardId`, sets `isDone = true` on `statusId`.
- For all tasks currently in `statusId`: set `doneAt = now()`.
- For tasks that were in previously-`isDone` statuses (now unset): clear `doneAt`.
- Emits `status:doneToggled` with the affected status + boardId.
- Enforces: there is always 0 or 1 `isDone` status per board. `toggleDone` swaps to a new target (clearing the old). `unsetDone` clears it entirely.

### `tasks.service`

- `findByList(listId)` → `findByStatus(statusId)`. Remove `where: { status: 'active' }` filter — all tasks returned regardless of status.
- `findByBoard` / list-all helpers: remove all `status: 'active'` filters.
- `create()`: takes `statusId` instead of `listId`. No `status` field set.
- `update()`: drop `dto.status` handling and the `status:` change-detection in activity detail. `listId`/`statusId` move handled separately.
- `move(taskId, { statusId, position })`:
  - Read the target status's `isDone`. If true, set `doneAt = now()` on the moved task. If false and the *source* status was `isDone`, clear `doneAt`.
  - Activity detail: `moved to "<statusName>"`.
  - Remove the `status` field from the update payload entirely.
- `archive()` method: **removed**. No archiving.
- All `_count` and `include` clauses that referenced `lists` now reference `statuses`.

### `boards.service`

- `findOne` / `findFull` `include`: `lists` → `statuses` (with nested `tasks` include).
- Default board seed: still creates `Backlog, To Do, In Progress, Review, Done` as `Status` rows; the "Done" row gets `isDone: true`.
- `findFull` no longer filters `status: 'active'` on tasks — all tasks load under their status.

### `mcp.service` + `tool-definitions.ts`

- Tool methods: `lists_list` → `statuses_list`, `lists_create` → `statuses_create`, `lists_update` → `statuses_update`, `lists_delete` → `statuses_delete`, `lists_reorder` → `statuses_reorder`. Add `statuses_toggle_done` (sets a status as the board's Done) and `statuses_unset_done` (clears the board's Done).
- `tasks_list` / `tasks_create` / `tasks_update` / `tasks_move`: `listId` param → `statusId`.
- Remove `status` from `tasks_list` filter schema and `tasks_update` body schema (the `active | done | archived` enum is gone).
- `tasks_move`: stamps `doneAt` per the same rule as `tasks.service.move`.
- Board-create tool description: "five default statuses" (was "lists").
- `tasks_list` description: drop "Defaults to active status." → "List tasks with optional filters."

### `relations.service`

- Drop `status` from the `RelationEntry` shape and from the `select` clauses on `fromTask`/`toTask`.
- Web `RelationEntry.task.status` field also removed.

### `notifications.service`

- Remove the `status:` change-detection branch in `summarize()` and its test.
- "moved" notifications still work — they read `statusName` (was `listName`) from the activity detail JSON.
- Future: a notification for "task done" (moved into isDone status) can be added later; not in scope.

### `app.module.ts`

- `ListsModule` import → `StatusesModule`.

## Web Changes (React)

### Types (`types/index.ts`)

- `List` interface → `Status`. Field names unchanged; add `isDone?: boolean`.
- `Task.listId` → `Task.statusId`. `Task.list` → `Task.status`. Drop `Task.status` union. Add `Task.doneAt?: string | null`.
- `Board.lists` → `Board.statuses`. `Board._count.lists` → `Board._count.statuses`.
- `RelationEntry.task.status` → removed.
- Update `types/index.test.ts` accordingly.

### Components

- **Delete `components/detail-status-select.tsx`** entirely — the active/done/archived picker no longer applies.
- `kanban-board.tsx`: `lists` → `statuses`, `board.lists` → `board.statuses`. "Add List" → "Add Status". Delete-list dialog → "Delete status". All `listId` → `statusId` in handlers. `filteredLists` → `filteredStatuses`. `creatingInList` → `creatingInStatus`. `pendingDeleteListId` → `pendingDeleteStatusId`. `AddListForm` → `AddStatusForm`.
- `board-column.tsx`: prop `list` → `status`, type `List` → `Status`. Menu items "Delete list" → "Delete status", "Edit list" → "Edit status".
- `task-card.tsx`: any `list`/`listId` reference → `status`/`statusId`.
- `task-detail-view.tsx`, `detail-properties-sidebar.tsx`, `detail-property-row.tsx`: remove the `DetailStatusSelect` usage; remove the status row. Keep the status-name display (which column the task is in) — rename to "Status".
- `create-task-dialog.tsx`: `lists` prop → `statuses`, `listId` → `statusId`.
- `create-task-modal.tsx`: `listId` → `statusId`.
- `board-settings-page.tsx`: list/status management UI → "Statuses". Add a control to toggle which status is the Done one (calls `toggleDone` endpoint) and an option to unset Done (calls `unsetDone`). Show a Done badge on the `isDone` status.
- `label-manager.tsx`: only if it references lists; otherwise untouched.
- `filter-chips-bar.tsx`: label filters stay; no list/status filter chips in this refactor.
- `inbox-list.tsx`, `inbox-task-detail.tsx`, `inbox-page.tsx`: rename any `list`/`status` references to `status`/`statusId`.

### Hooks

- `api.ts`: `api.lists.*` → `api.statuses.*`. Endpoint paths `/api/lists` → `/api/statuses`. Add `api.statuses.toggleDone(boardId, statusId)` and `api.statuses.unsetDone(boardId)`.
- `use-boards.ts`: `useBoardFull` returns `board.statuses`. Cache key `['boards', id, 'full']` unchanged (response shape changes).
- `use-tasks.ts`: `useCreateTask` mutates `statusId`. `useTasksByBoard` / any list-scoped query → status-scoped.
- `use-board-view-state.ts`: label filters unchanged. No status filter state in this refactor (future work).
- `api.test.ts`: update mock endpoints and response shapes.

### Pages

- `tasks-page.tsx`, `task-detail-page.tsx`, `home-page.tsx`: rename `list`/`lists` references to `status`/`statuses`.

## Out of Scope (explicitly deferred)

- **Views and per-view filters** — the user mentioned future views with filters like "Done column date range" (show Done tasks completed within N days). The data foundation (`doneAt`, `isDone`) is laid here; the filter UI is a separate later piece of work.
- **"Task done" notifications** — possible future feature when a task enters the Done status.
- **Auto-coloring or terminal-status semantics** — `isDone` carries no color/visual auto-derivation in this refactor; the status color is set manually like any other.
- **Labels** — untouched.

## Testing

- All API spec files: `board.lists[0].id` → `board.statuses[0].id`. Drop tests asserting `status: 'archived'` / `status: 'done'` behavior (the `archived` test in `tasks.service.spec.ts`, the `status:` notification test). Remove the `findByList`-named describe block → `findByStatus`.
- Add test: `StatusesService.toggleDone` swaps `isDone` correctly and stamps/clears `doneAt` on affected tasks.
- Add test: `tasks.service.move` into an `isDone` status stamps `doneAt`; moving out clears it; moving between non-done statuses leaves `doneAt` untouched.
- Add test: every task is returned from `findFull` regardless of which status it's in (no hidden filter).
- Add test: default board seed creates exactly one status with `isDone = true` (the "Done" one).
- Web `types/index.test.ts`: update to `Status` shape with `isDone`, drop `Task.status` union test.
- Web `api.test.ts`: update mocked endpoints and payloads to `statuses` / `statusId`.

## Migration Rollout

The migration runs via `docker-entrypoint.sh` (`prisma migrate deploy`) on container startup, so shipping this is: commit the migration file, open a PR, let CI pass, merge to main, release workflow builds and pushes the image, redeploy runs the migration. No manual step needed beyond local migration generation:

```
pnpm --filter @taskforge/api prisma:migrate -- --name rename_list_to_status_add_isDone_doneAt
```