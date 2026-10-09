# Projects v2 — workspace-level projects, kanban view, documents (design)

Status: approved by human review 2026-10-08 (spec reviewed, changes requested and folded in).
Human decisions recorded in chat 2026-10-08:

- boardId **removed** from Project (all projects are workspace-level).
- Project URLs go **global**: `/projects`, `/projects/:projectId`; per-board sidebar sub-item removed; a top-level "Projects" sidebar item sits near Boards.
- Permission: **all members** — every authenticated user creates/edits/deletes projects.
- Project kanban columns are **per-status** (union of distinct statuses across the project's boards).
- Documents: `taskId` AND `boardId` become nullable, `projectId` added; a doc attaches to exactly one of task/project.
- Bounded batch (edit dialog, lead pickers, task→project navigation, badge wrap) approved and ships as milestone A.

## §0 Milestone A — bounded batch (first, no schema change)

1. `edit-project-dialog.tsx` (components): name, description, icon, status, lead, startDate, targetDate. Opened from the list page (per-row action) and the detail page header. PUT via `useUpdateProject`. Status edits ride the completedAt lifecycle already implemented server-side.
2. Lead picker in `create-task-dialog`… scoped correction: lead picker for PROJECTS — in create-project dialog (list page) and the edit dialog, using the same member/user input pattern as the assignee input (`useUserDirectory`).
3. Task detail project row, Linear-style: subheader "Project", below it the select and a chevron button side by side; chevron navigates to the project page (v2 URL `/projects/:id`; until v2 routes land it links to the v1 board-scoped URL — implemented in v2 step to avoid double churn; the row change and the chevron land together in v2).
   - Milestone-A resolution: ship the edit dialog + lead pickers + badge wrap in A; ship the navigation row in v2 when global routes exist.
4. Task-card badge area (3rd row) wraps: `flex-wrap` + `min-w-0` so long names overflow by wrapping, not clipping.

## §1 Data model

- `Project`: drop `boardId`, the Board relation, and `@@index([boardId, status])` / `@@index([boardId, position])`; add `@@index([position])`. A migration backfills away the column; existing rows become workspace projects (no data loss, SQLite column-drop rebuild).
- `Task.projectId`: FK unchanged (SetNull). Validation P2 (project.boardId must equal task's board) is DELETED — REST `validateProject` and MCP's inline mirror both lose the board check and its 'Project is on a different board' branch.
- `Document`: `taskId` and `boardId` become nullable, `projectId String?` added; a document attaches to exactly one of task/project (service enforces XOR on create/update). `number` uniqueness `@@unique([boardId, number])` must be reworked — document numbering becomes a per-scope counter: task docs keep board counters; project docs get a new counter column on Project (`nextDocNum Int @default(1)`) with `@@unique([projectId, number])`.

## §2 Permissions

All members: create/update/delete open to every authenticated user (bot sessions rejected for project management, matching publish's bot-gate). MembersService gating and the legacy-board fallback are removed from ProjectsService entirely. Documents on projects follow the documents module's existing gates (uploader/board-admin/delete rules extended: project-level docs — edit/delete by any member in v2-wide per the all-members decision).

## §3 REST + MCP + events

- REST: `GET /api/projects` (all projects, position order), `POST /api/projects`; `GET/PUT/DELETE /api/projects/:id` unchanged. `GET/POST /api/boards/:boardId/projects` removed. CreateProjectDto loses boardId; CreateTaskDto/UpdateTaskDto keep projectId.
- Task progress rollup: unchanged (project's tasks irrespective of board).
- Documents: `GET /api/documents?projectId=` (or reuse existing list route with a projectId query), create/update/delete ride the existing documents module with `projectId` in DTOs; XOR enforcement + project counter increment live in DocumentsService.
- MCP: projects_create loses boardId; adds `projects_documents_*`… NO — document tools are generic: `documents_create` (board? no) — MCP gains `projectId` on `documents_*` tools and a `task/project XOR` validation mirror.
- Socket: `project:created/updated/deleted` and `task.project.updated` broadcast GLOBALLY (no boardId room) since projects are no longer board-scoped; clients on global pages must receive them without a room join. Web invalidation keys: `['projects', boardId]` → `['projects']` (list) and `['projects', id]` (detail) — the board-keyed blocks simplify.
- Activity: none new (v1 rule stands; docs activity continues via existing actions with the subject's task/project reference in detail).

## §4 Project kanban view

> **Removed 2026-10-09** (human partner decision after using it): with tasks from 2+ boards the per-board status columns were confusing and the view unusable. The project page keeps only the grouped list. The section below is kept as history.

- Project page gets a view toggle: Grouped list (current) | Kanban | (list view rides v2 if cheap, else defer).
- Kanban columns: one column per DISTINCT status (id+name) present across the project's tasks (colored by status.color; empty statuses omitted). A card can only be dropped into a status of its OWN board; other boards' columns are not drop targets. Cross-board re-boarding is out of scope (decided 2026-10-08): task numbers, labels and doc numbers are board-scoped, so moving boards would change a task's identity. The API rejects a foreign statusId on move/update with 400.
- Column header shows status name + count; card click navigates to the task (existing task route `/board/:boardId/task/:taskId` — still board-scoped because tasks stay board-scoped).
- Socket: `task:updated` stays board-scoped. Project kanban freshness: when a project-linked task changes status or position, TasksService (and the MCP mirror) also emit `task.project.updated`, which project pages already invalidate on.

## §5 Project documents

- Detail page tabs: "Tasks" (existing list + kanban) | "Documents".
- Documents tab: list (title, number, updatedAt, author), open in the existing document viewer route if one exists (check `documents` web components — task docs render somewhere; project docs reuse it), New document button (create with projectId), delete.
- Public page: unaffected (public exposure of project docs out of scope).

## §6 Web structure

- Routes: `/projects` (ProjectsPage, global) and `/projects/:projectId` (ProjectDetailPage). Per-board routes and sidebar sub-item removed; sidebar gains top-level "Projects" item near Boards with a count badge maybe. Task-detail chevron → `/projects/:projectId`.
- `use-projects.ts`: list query key `['projects']`; detail `['projects', id]`; mutations invalidating accordingly. `api.projects.list/create` lose boardId.
- Socket: project:* handled globally (no boardId fallback needed); `task.project.updated` invalidates `['projects', task.projectId]` + `['projects', task.previousProjectId]` (already null-guarded) — minus the board-task keys only if those stay board-scoped (they do; keep them).

## §7 Testing

- API: migration round-trip (existing project rows survive with NULL-removed boardId); XOR doc validation; project doc counter; REST/MCP parity for boardId-less projects; kanban move with cross-board status re-boards; emit-matrix (global project events on project changes; task.project.updated on linked-task moves).
- Web: route moves (global pages render without board context), kanban columns per distinct status, move → re-board + invalidation, documents tab CRUD wiring, edit dialog, lead picker, badge wrap.
- tsc error count unchanged (5 as of the v1 close; re-baseline at plan time).

## §8 Explicit non-goals (v2)

- Cross-board grouping/filters beyond "all projects on one page".
- Project archives/health/updates/posts.
- Publishing projects or their docs publicly.
- Per-column drag-reorder of tasks inside the project kanban (move-between-columns only).

## §9 Migration safety

SQLite ALTER TABLE cannot drop a column with FK easily — prisma migrate dev will do the rebuild; verify Project data survives (seeded test covers). Document table rebuild likewise; confirm the numbering rework's data backfill: existing documents keep boardId+taskId+number; `projectId` starts null everywhere.
