# Status Types — Design

**Date:** 2026-08-30
**Status:** Approved, pending implementation plan
**Scope:** Replace the `isDone`/`isDuplicate` booleans on `Status` with a `type` enum column aligned with Linear's issue status model. Add type-derived progress rules, auto-unblock on done, a full CRUD statuses subpage under board settings, and consolidate the 3 drifted seed sites into one shared constant.

## Problem

The current `Status` model has two independent booleans (`isDone`, `isDuplicate`) and no "type" concept. "Closed" is derived as `isDone || isDuplicate` in two hand-mirrored spots (`TasksService.move`, MCP `tasks_move`). `isDone` is single-per-board via a `toggleDone` transaction; `isDuplicate` is seed-only and immutable through the API. The default seed is duplicated in 3 places (REST, MCP, test setup) and has already drifted (MCP + tests omit `progress`). The board settings `StatusesSection` only exposes progress + done-toggle — no add/edit/delete/name/color/reorder.

Linear's model is: each status has a **type** from a fixed set (`triage`, `backlog`, `todo`, `in_progress`, `done`, `cancelled`, `duplicate`). You can have multiple columns of the same type. Progress is derived from type with per-type editability rules. Terminal types stamp `doneAt` and (for `done`) auto-resolve blockers.

## Decisions (from brainstorming)

| Question                     | Decision                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type field representation    | Add `type TEXT` column, drop `isDone`/`isDuplicate` booleans. Keep `progress` column (stored, editable per type rules).                                                                                                                      |
| Per-type uniqueness          | No uniqueness constraints. Any type can have multiple columns. `toggleDone` transaction eliminated entirely.                                                                                                                                 |
| Progress derivation          | Type provides defaults: `backlog`/`todo`/`triage` = 0, `in_progress` = 50, `done` = 100, `cancelled`/`duplicate` = null. `backlog`/`todo`/`done`/`cancelled`/`duplicate` are locked (not editable). `triage` and `in_progress` are editable. |
| Terminal types and `doneAt`  | `done` and `cancelled` stamp `doneAt` on entry, clear on exit. `duplicate` does NOT stamp `doneAt`.                                                                                                                                          |
| Auto-unblock                 | Moving a task into a `done`-type column auto-resolves all `blocks` relations where that task is the blocker (source). `cancelled` and `duplicate` do NOT unblock.                                                                            |
| Duplicate column behavior    | Creating a `duplicate_of` relation still auto-moves the task into the first `duplicate`-type column by position. If none exists, the task stays put.                                                                                         |
| Settings UI structure        | Split the flat board settings page into a tabbed layout with child routes under `/board/:id/settings/*`. Statuses becomes a full CRUD page at `/board/:id/settings/statuses`.                                                                |
| Statuses page CRUD scope     | Full CRUD: add (name + type + color), edit (name/type/color/progress-for-editable-types), reorder, delete. Drop `wipLimit` from UI/DTO (kept in DB).                                                                                         |
| Default seed                 | 6 columns: Backlog (backlog), Todo (todo), In Progress (in_progress), Done (done), Cancelled (cancelled), Duplicate (duplicate). Review column dropped.                                                                                      |
| Kanban board add flow        | Remove inline add-status form from the kanban board. Status creation happens in settings only. Board keeps column menu (edit → settings, delete with confirm).                                                                               |
| `toggleDone`/`unsetDone` API | Remove endpoints and MCP tools entirely. Type is set on create and editable via update.                                                                                                                                                      |
| Approach                     | Single migration, full restructure in one cycle (Approach A). No compat shims, no dual sources of truth.                                                                                                                                     |

## Data Model & Migration

### `Status` model (after)

```prisma
model Status {
  id        String   @id @default(cuid())
  boardId   String
  name      String
  type      String   @default("todo")   // triage | backlog | todo | in_progress | done | cancelled | duplicate
  position  Float
  color     String?  @default("#6366f1")
  wipLimit  Int?                              // kept in DB, removed from DTOs/UI
  progress  Int?     @default(0)              // nullable now (cancelled/duplicate = null)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks Task[]
}
```

- **Added:** `type String @default("todo")`, `progress` becomes `Int?` (was `Int`)
- **Removed:** `isDone Boolean`, `isDuplicate Boolean`
- **Kept:** `wipLimit Int?` (dead but harmless; removing it is an extra migration for no benefit)

### Migration: `add-status-type-drop-booleans`

1. `ALTER TABLE statuses ADD COLUMN type TEXT NOT NULL DEFAULT 'todo'`
2. Backfill: `UPDATE statuses SET type = 'done' WHERE isDone = 1;` then `UPDATE statuses SET type = 'duplicate' WHERE isDuplicate = 1;`
3. `ALTER TABLE statuses DROP COLUMN isDone;`
4. `ALTER TABLE statuses DROP COLUMN isDuplicate;`
5. `progress` column changes from `Int` (NOT NULL) to `Int?` (nullable). SQLite cannot alter column constraints in place, so Prisma handles this via a table rebuild (create new table with nullable column, copy data, drop old, rename). The migration SQL is auto-generated by `prisma migrate`; no manual SQL needed.

SQLite supports `DROP COLUMN` since 3.35.0 (2021); the bundled Prisma SQLite is newer.

### Progress-by-type rules (enforced in service layer)

| Type        | Default progress | Editable?               |
| ----------- | ---------------- | ----------------------- |
| triage      | 0                | yes                     |
| backlog     | 0                | **no** (locked to 0)    |
| todo        | 0                | **no** (locked to 0)    |
| in_progress | 50               | yes                     |
| done        | 100              | **no** (locked to 100)  |
| cancelled   | null             | **no** (locked to null) |
| duplicate   | null             | **no** (locked to null) |

On create, the service sets `progress` from the type default. On update, if `type` changes, progress is recomputed: locked types force their value; editable types keep existing progress unless the update specifies a new one. Progress updates for locked types are rejected with `BadRequestException`.

### Existing board migration

Existing boards keep their current statuses. The migration backfills `type` from the booleans:

- `isDone = true` → `type = 'done'`
- `isDuplicate = true` → `type = 'duplicate'`
- everything else → `type = 'todo'`

No statuses are deleted or renamed. The "Review" column on existing boards becomes `type: 'todo'` (it was neither done nor duplicate). The new "Cancelled" column is only seeded for **new** boards, not retroactively added.

`doneAt` on migration: no bulk reprocessing needed. `done`-type tasks already have `doneAt` (from the old `toggleDone`). `duplicate`-type tasks have `doneAt = null` (duplicate never stamped it). No `cancelled`-type tasks exist yet.

## API Changes

### DTOs (`apps/api/src/statuses/dto/status.dto.ts`)

**`CreateStatusDto`:**

- `boardId, name, type, position?, color?`
- `type` validated against the 7 allowed values via `@IsIn([...])`
- `type` is required (forces conscious choice)
- `progress` and `wipLimit` removed from DTO

**`UpdateStatusDto`:**

- `name?, type?, position?, color?, progress?`
- `progress` accepted only when the current status type is editable (triage or in_progress). Service rejects with `BadRequestException` for locked types.
- When `type` changes, service recomputes progress per type rules.

### `StatusesService` (`apps/api/src/statuses/statuses.service.ts`)

- `create(dto)`: sets `progress` from type default. No longer accepts `isDone`/`isDuplicate`.
- `update(id, dto)`: if `type` is changing, recompute progress. If `progress` in dto, validate type allows editing.
- **Removed:** `toggleDone`, `unsetDone`.
- `findByBoard`, `findOne`, `reorder`, `remove` — unchanged.

### `TasksService.move` (`apps/api/src/tasks/tasks.service.ts`)

The `isDone || isDuplicate` derivation becomes type-based:

```ts
const TERMINAL_FOR_DONEAT = ['done', 'cancelled'];
const TERMINAL_TYPES = ['done', 'cancelled', 'duplicate'];
const isClosedTarget = TERMINAL_TYPES.includes(targetStatus.type);
```

- Entering `done` or `cancelled` → stamp `doneAt = now()` (if not already set)
- Leaving any terminal type → clear `doneAt`
- Entering `duplicate` → no `doneAt` change
- **New:** Entering `done` type → auto-resolve all `blocks` relations where this task is the source (blocker). See Auto-Unblock section.

### `RelationsService` (`apps/api/src/relations/relations.service.ts`)

`duplicate_of` creation: find the first `duplicate`-type status by position:

```ts
findFirst({ where: { boardId, type: 'duplicate' }, orderBy: { position: 'asc' } });
```

If none exists, skip the auto-move (task stays put, no error).

### MCP (`apps/api/src/mcp/mcp.service.ts`)

- `handleStatuses`: `create` accepts `type`, `update` accepts `type`. Remove `toggle_done` and `unset_done` handlers.
- `handleTasks` `move`: same type-based doneAt/unblock logic as `TasksService.move`.
- `handleBoards` `create`: seed defaults with `type` values from the shared constant.

### MCP tool definitions (`apps/api/src/mcp/tool-definitions.ts`)

- `statuses_create`: add `type` (required), remove `progress`, `wipLimit`.
- `statuses_update`: add `type`, remove `progress`, `wipLimit`.
- **Removed:** `statuses_toggle_done`, `statuses_unset_done`.

### Controller (`apps/api/src/statuses/statuses.controller.ts`)

- **Removed:** `POST /:id/toggle-done`, `POST /board/:boardId/unset-done`.
- Other routes unchanged.

### Default seed consolidation

Extract the 6 default statuses into a shared constant (`DEFAULT_STATUSES`), used by `BoardsService.create`, `McpService.handleBoards.create`, and `test/setup.ts seedBoard`. Each entry: `{ name, type, color, progress }`. Kills the 3-way drift.

## Auto-Unblock on Done

When a task moves into a `done`-type status (in `TasksService.move` and MCP `tasks_move`):

1. Query `TaskRelation` rows where `type = 'blocks'` AND `fromTaskId = task.id`.
2. Delete them (`deleteMany`).
3. Emit `relation:deleted` per row (following `cleanupForTask`'s pattern) so WebSocket clients update.
4. Write an activity row on each **unblocked** task (`toTaskId`): `action: 'unblocked'`, `detail: JSON.stringify({ blockerTaskId, blockerCompleted: true })`, attributed to the move actor.
5. No activity row on the done task itself for the unblocking — the `moved` activity already captures the status change.

`cancelled` and `duplicate` moves do NOT trigger unblocking.

## Settings UI Restructure

### Routing (`apps/web/src/app.tsx`)

Split `/board/:id/settings` into a layout with child routes:

```
/board/:id/settings           → redirect to /board/:id/settings/general
/board/:id/settings/general   → General (emoji + name)
/board/:id/settings/statuses  → Statuses (full CRUD)
/board/:id/settings/labels    → Labels
/board/:id/settings/members   → Members
/board/:id/settings/danger    → Danger Zone (delete board)
```

### Layout (`board-settings-layout.tsx`)

- 48px header stays (back arrow + board icon + name + "— Settings").
- Horizontal tab bar under the header: General, Statuses, Labels, Members, Danger.
- Active tab styled per design system (no Acid Lime — use border-bottom or subtle bg).
- `<Outlet />` renders the active section.

### Section files (`apps/web/src/pages/board-settings/`)

- `general-section.tsx` (moved from current `BoardInfoSection`)
- `statuses-section.tsx` (new, full CRUD)
- `labels-section.tsx` (moved from current `LabelsSection`)
- `members-section.tsx` (moved from current `MembersSection`)
- `danger-section.tsx` (moved from current `DeleteBoardSection`)

### StatusesSection (full CRUD at `/board/:id/settings/statuses`)

- **List:** each row shows `ProgressIcon` (type-aware) + name + type badge + color swatch + task count. Sorted by position.
- **Add form:** name input + type dropdown (7 options, default `todo`) + color picker. Creates via `api.statuses.create({ boardId, name, type, color })`.
- **Edit inline:** click a row to expand — edit name, type, color. Changing type re-applies progress rules (shown read-only). Save calls `api.statuses.update`.
- **Reorder:** drag handles (up/down). Calls `api.statuses.reorder`.
- **Delete:** trash icon per row with confirm dialog. Calls `api.statuses.delete`.
- **Progress:** shown read-only in the list (derived from type). For editable types (triage, in_progress), a number input appears in the expanded editor.

### Type badges

Small labels next to status name showing the type (e.g. "Done", "In Progress"). Styled with the type's color, using `font-mono` per design system.

## Web Type System & Component Updates

### Web `Status` type (`apps/web/src/types/index.ts`)

```ts
export type StatusType =
  | 'triage'
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'duplicate';

export interface Status {
  id: string;
  boardId: string;
  name: string;
  type: StatusType;
  position: number;
  color?: string;
  progress?: number | null;
  tasks?: Task[];
  _count?: { tasks: number };
}
```

- **Removed:** `isDone`, `wipLimit`
- **Added:** `type`
- `progress` becomes `number | null` (was `number?`)

### Type helpers (`apps/web/src/lib/status-type.ts`)

```ts
const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};
export const defaultProgressForType = (type: StatusType) => PROGRESS_BY_TYPE[type];
export const isProgressEditable = (type: StatusType) => type === 'triage' || type === 'in_progress';
export const isTerminalType = (type: StatusType) =>
  type === 'done' || type === 'cancelled' || type === 'duplicate';
export const stampsDoneAt = (type: StatusType) => type === 'done' || type === 'cancelled';
```

### `ProgressIcon` (`apps/web/src/components/progress-icon.tsx`)

- Stays as the SVG ring, colored by progress value (unchanged for non-null progress).
- For `null` progress (cancelled/duplicate): render a neutral gray filled circle or a distinct icon (slash for cancelled, copy/layers icon for duplicate).
- Component takes `progress: number | null` and `type?: StatusType` to pick the right rendering.

### `BoardColumn` (`apps/web/src/components/board-column.tsx`)

- Header: `ProgressIcon` (now type-aware) + name + count. Structure unchanged.
- Column dropdown: "Edit status" → `navigate('/board/:id/settings/statuses')`. "Delete status" stays. **Add-status form removed** from the kanban board.

### `DetailStatusSelect` (`apps/web/src/components/detail-status-select.tsx`)

- Lists statuses with type-aware `ProgressIcon` + name. Flat list (no grouping by type since multiple columns of same type would be confusing).

### API client (`apps/web/src/hooks/api.ts`)

- `api.statuses.create`: `{ boardId, name, type, color?, position? }` (drop `wipLimit`, add `type`)
- `api.statuses.update`: `{ name?, type?, color?, position?, progress? }` (drop `wipLimit`, add `type`)
- **Removed:** `toggleDone`, `unsetDone` methods.

### Kanban board (`apps/web/src/components/kanban-board.tsx`)

- Remove `AddStatusForm` component and its rendering.
- Column menu "Edit status" target updated to `/board/:id/settings/statuses`.

## Default Seed

Shared `DEFAULT_STATUSES` constant:

| pos | name        | type        | color   | progress |
| --- | ----------- | ----------- | ------- | -------- |
| 0   | Backlog     | backlog     | #94a3b8 | 0        |
| 1   | Todo        | todo        | #6366f1 | 0        |
| 2   | In Progress | in_progress | #f59e0b | 50       |
| 3   | Done        | done        | #22c55e | 100      |
| 4   | Cancelled   | cancelled   | #64748b | null     |
| 5   | Duplicate   | duplicate   | #64748b | null     |

No Review column, no Triage column (users add via settings if wanted).

## Testing

### API tests

**`statuses.service.spec.ts`:**

- Update `findByBoard`: assert `type` instead of `isDone`/`isDuplicate`; Done has `type: 'done'`, Duplicate has `type: 'duplicate'`.
- `create`: test each type; verify progress auto-set from type default; verify locked types ignore client progress.
- `update`: test type change recomputes progress; test progress rejected for locked types (`BadRequestException`); test progress accepted for `in_progress`.
- Remove `toggleDone`/`unsetDone` test blocks.
- Add: `create` without `type` → `BadRequestException`.

**`tasks.service.spec.ts`:**

- `move`: update doneAt tests to type-based statuses. Test done stamps doneAt + auto-resolves blocks. Test cancelled stamps doneAt, no unblock. Test duplicate does neither. Test leaving terminal clears doneAt.
- Add auto-unblock test: task A blocks B; move A to done; assert relation deleted, activity on B (`action: 'unblocked'`), `relation:deleted` event.

**`relations.service.spec.ts`:**

- `duplicate_of` creation: expect move to first `duplicate`-type status by position. Test no duplicate-type status exists → task stays put.

**`boards.service.spec.ts`:**

- Board creation: assert 6 statuses with correct `type` values. Assert `isDone`/`isDuplicate` no longer exist.

**`mcp.service.spec.ts`:**

- `statuses_create`/`update`: add `type` to payloads; assert persisted.
- Remove `statuses_toggle_done`/`unset_done` test blocks.
- `tasks_move`: mirror doneAt/unblock tests.

### Web tests

**`board-settings-page.test.tsx`:**

- Test tabbed layout. Test "Statuses" tab navigates to `/board/:id/settings/statuses` and renders list. Test add form, inline edit, delete with confirm.

**`types/index.test.ts`:**

- Update `Status` fixture to include `type`, remove `isDone`.

**`kanban-dnd.test.ts`:**

- Update synthetic `Status` objects to include `type`.

**Component tests mocking `hooks/api.ts`:**

- Add `type` to `create` signature in mock factory. Remove `toggleDone`/`unsetDone` from mock.
