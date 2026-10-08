# Projects (TFG-34) — Design

Status: approved in chat 2026-10-08 (design = TFG-34 description + gap resolutions below).
Source task: TFG-34 ("[P1] Projects") on board TFG.

## Purpose

Linear-style planning layer above tasks: a Project groups tasks on a single board
with a lead, status, dates, and a progress rollup. Without it TaskForge can't
express "the payments feature is 12 tasks, shipping Q3". `Task.metadata` doesn't
substitute — no rollup, no status, no dates.

## Scope (v1)

- Single-board projects only. Cross-board projects, milestones, health,
  project updates: P2+ / out of scope.
- One project per task (nullable `Task.projectId`).
- Reads stay unscoped (repo convention); writes gate on board admins.

## Data model

New `Project` model:

- `id`, `boardId` (required, `Board.projects` back-relation, `onDelete: Cascade`)
- `name String`, `description String?`
- `icon String` default `"📦"` (emoji)
- `leadId String?` → User, `onDelete: SetNull`
- `status String` default `"planned"` — validated against a `PROJECT_STATUSES`
  const (`planned|started|completed|paused|canceled`) + `@IsIn` in DTOs.
  No Prisma enum (schema has none; views precedent). No DB CHECK constraint.
- `completedAt DateTime?` — stamped when `status` flips to `completed`, cleared
  when it flips away.
- `startDate DateTime?`, `targetDate DateTime?`
- `position Int` (ordering on the board's project list)
- `createdAt`, `updatedAt`
- Indexes: `@@index([boardId, status])`, `@@index([boardId, position])`
- Unique: none beyond id (duplicate project names on a board are allowed, like
  statuses in different boards — keep it simple).

`Task`: add `projectId String?` + `project Project?` relation,
`onDelete: SetNull` (deleting a project unlinks tasks, never deletes them —
matches assignee/parent semantics). Board back-relations follow the `View[]`
pattern at schema.prisma:119.

## REST API (`apps/api/src/projects/` — controller, service, module, service.spec, dto/)

Pattern: `apps/api/src/views/` (the cleanest recent feature module).

- `GET /api/boards/:boardId/projects` — list, ordered by `position` asc.
- `POST /api/boards/:boardId/projects` — create; appends at end of board
  (position = max+1, like statuses).
- `GET /api/projects/:id` — project + task list (filtered by projectId) +
  progress counts.
- `PUT /api/projects/:id` — update any field via null-safe spread
  (`...(dto.x !== undefined && { x })`, views precedent). On `status` change:
  stamp/clear `completedAt` when entering/leaving `completed`. Emits
  `project_status_changed` activity when only the status changed to completed.
- `DELETE /api/projects/:id` — Prisma `SetNull` unlinks tasks automatically.

Write-gating (create/update/delete): `MembersService.isBoardAdmin(boardId, userId)`
or global admin (`user.role === 'admin'`) or legacy board (zero Member rows) —
exactly the views pattern. Reads: any authenticated user (repo convention).

### Task↔project linkage

- `PUT /api/tasks/:id` accepts `projectId` on `UpdateTaskDto` (nullable):
  - DB write uses `!== undefined` (existing pattern, tasks.service.ts:316-326).
  - Validation: if a non-null `projectId` is given, the project must exist and
    belong to the task's board → 400 otherwise.
  - Activity diff: copy the `parentId`/`estimate` explicit-`!== undefined`
    pattern — `projectId: null` logs `task_removed_from_project`, a new project
    id logs `task_added_to_project`. NO bare truthy checks (would silently skip
    null un-assignment — the same bug class as `setPublic` vs UpdateTaskDto).
  - MCP `tasks_update` mirrors this inline (`mcp.service.ts:428-479`) OR —
    preferred — MCP projects/task linkage delegates to `TasksService.update`
    to keep one implementation. Decide at implementation time by which is
    less invasive to `mcp.service.ts`; never duplicate the diff logic.

### Progress rollup

`GET /api/projects/:id` returns counts derived from task `status.type`:

- `total` = tasks in the project
- `completed` = tasks whose status `type === 'done'`
- `byStatus` = count per `status.type` (`todo|in_progress|done|backlog|...`
  returned verbatim, aggregated in one `groupBy(['projectId', 'statusTypeId'])`-style
  query or one `findMany` with select — NOT N+1 per status)

Cancelled counts toward `total` but not `completed` (matches Linear: a
cancelled task shouldn't inflate completion %).

## Events (WebSocket)

Via existing `EventsService.emit(event, data, boardId?)` (board-scoped):

- `project:created`, `project:updated`, `project:deleted`
- `task.project.updated` when a task's projectId changes (activity rows
  `task_added_to_project` / `task_removed_from_project` ride the same code path).

Frontend `use-socket.ts` mirrors the `view:*` block: map events to
`invalidateQueries` for `['projects', boardId]` and `['tasks', boardId]`.
Register event names in the existing event list (use-socket.ts:271-273).

## Activity

New actions in ActivityLog: `task_added_to_project`, `task_removed_from_project`,
`project_status_changed`. Follow existing activity emitters
(`tasks.service.ts` uses the same `ActivityService`/`prisma.activity` path as
labels/statuses). Do NOT add a `mentioned`-style bypass; activity only, no
notifications for project changes in v1.

## MCP (`apps/api/src/mcp/`)

- New tool group in `TOOL_DEFINITIONS` (tool-definitions.ts) + a
  `case 'projects':` in the dispatcher → `handleProjects(action, params, user)`
  modeled on `handleViews` (mcp.service.ts:726-760): thin switch delegating to
  `ProjectsService` (no inline logic to keep out of sync).
- Tools: `projects_list`, `projects_get`, `projects_create`, `projects_update`,
  `projects_delete`.
- `tasks_create` / `tasks_update` accept `projectId` (validate board-scoping
  same as REST; create passes straight through with a nullable field).

## Web UI (`apps/web/`)

Placement decided in chat: **sidebar sub-item**, sibling of Issues / Docs /
Settings (pattern: sidebar-layout.tsx:187-239) — NOT a kanban-board section.

- Route: `/board/:boardId/projects` → `pages/projects-page.tsx` (list of
  projects on the board: icon, name, status chip, lead, progress bar,
  target date). Route declared inline in `app.tsx`, wrapped in
  `SidebarLayout` like every authed route.
- Route: `/board/:boardId/projects/:projectId` → `pages/project-detail-page.tsx`
  — header (icon, name, lead, status, startDate/targetDate, description) +
  task list **grouped by status** + "Add task to project" action (reuses
  `create-task-dialog` with projectId pre-set).
- Task create/edit dialog (`create-task-dialog.tsx`): add a project picker
  populated from `useProjects(boardId)` (new hook, query key
  `['projects', boardId]`, mirroring `use-views.ts`), filtered to the task's
  board. Task detail view gets the same picker.
- Kanban task card: project icon badge when `task.project` is hydrated on
  card payloads.
- Sidebar: add "Projects" link under each board (sidebar-layout.tsx).
- Styling: per AGENTS.md, follow `design.md` tokens — progress bar in
  Obsidian/Charcoal with lime only if it's the page's single primary CTA slot
  (it is not, in a list row — use neutral fill + inset border).

## Tests

- API (`projects.service.spec.ts`): CRUD, board-scoping validation of
  task↔project (`400` for cross-board), write-gating (non-admin member
  rejected, global admin ok, legacy board ok), progress rollup (done vs
  cancelled), `completedAt` stamp/clear, activity actions on assign/un-assign.
- Task service spec: `projectId` in update → activity rows for both add and
  remove (the truthy-check regression).
- MCP spec: `projects_*` dispatch + `tasks_update` with projectId.
- Web (Vitest): `projects-page` render, `project-detail-page` render +
  assignment, following the existing component-test mock pattern
  (mock the `use-*` hook modules).

## Seed/test helpers

- `apps/api/test/setup.ts`: add `seedProject()` (plain `prisma.project.create`
  with overrides, like `seedTask` — no board counter bump needed).
- Update reverse-dependency cleanup order in `afterEach` (projects before
  tasks? No — projects are referenced BY tasks, so delete projects AFTER
  tasks unlink via SetNull... in practice: deleteMany on projects then tasks,
  mirroring how views/statuses are ordered — follow existing order, adjust if
  FK errors appear).

## Out of scope (v1)

- Cross-board projects, milestones, project health, project updates/posts.
- Notifications on project changes.
- Public-page exposure of projects.
- Drag-reorder of projects (position field exists; UI reorder later).
