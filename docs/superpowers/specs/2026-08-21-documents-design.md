# Documents — Design

## Overview

Tasks can include documents. A document is markdown content attached to exactly one task. Documents get a board-level number (`D-1`, `D-2`, ...) as their human-facing identity, are viewable full-page in an editor, and can be published to a public read-only page. Full MCP support via a new `documents_*` tool namespace.

Chosen format is markdown (matches existing comments/descriptions and the `MarkdownEditor`/autosave stack). Chosen architecture is a standalone `documents` domain module, mirroring `comments`/`labels` — not folded into `TasksService`.

## Data model

New `Document` model, added to `apps/api/prisma/schema.prisma`:

```prisma
model Document {
  id         String    @id @default(cuid())
  boardId    String
  taskId     String            // every document belongs to exactly one task
  number     Int               // board-level counter: D-1, D-2, ...
  title      String
  body       String            // markdown, default ""
  isPublic   Boolean   @default(false)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  board  Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@unique([boardId, number])
  @@index([boardId])
  @@index([taskId])
  @@map("documents")
}
```

- `Board` gains `nextDocNum Int @default(1)`, incremented inside the create transaction — same pattern as `nextTaskNum`. Doc number is unique per board, so identity is `identifier-D-<number>`.
- Delete cascades from board and task: deleting a task removes its documents.
- No `authorId` column. Attribution is handled by Activity rows (which carry the actor string), consistent with `Comment`.
- `Task` gains a back-relation `documents Document[]`; `Board` gains `documents Document[]`.

## API — documents module

New NestJS domain module `apps/api/src/documents/` with `controller.ts`, `service.ts`, `module.ts`, `service.spec.ts`, and `dto/`.

### REST routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/boards/:boardId/documents` | Board docs index — id, number, docNumber, taskNumber, title, updatedAt. Body excluded. |
| `GET` | `/api/tasks/:taskId/documents` | Docs for one task, newest first. |
| `POST` | `/api/tasks/:taskId/documents` | Create (title, body). Assigns next doc number in a transaction. |
| `GET` | `/api/documents/:id` | Single doc, includes body + taskNumber + board identifier. |
| `PUT` | `/api/documents/:id` | Update title/body (full replace — autosave-friendly). |
| `DELETE` | `/api/documents/:id` | Delete. |
| `PUT` | `/api/documents/:id/publish` | Publish. `assertNotBot`, same rule as tasks. |
| `DELETE` | `/api/documents/:id/publish` | Unpublish. `assertNotBot`. |

`GET /api/documents/:id` also returns the linked task's `taskNumber` (e.g. `TFG-12`) so the editor can show a "back to task" link.

### Publish rule

Deliberately **not** a field on the update DTO and **not** an MCP tool. Same rationale as `TasksService.setPublic`: the update path's diff logic can't reliably log a `false`, and a generic `documents_update` must not be able to publish a document as a side effect. Publish/unpublish write Activity rows (`published`/`unpublished`). Rejects bot sessions (`session.bot`).

### Activity & notifications

Creating/updating/deleting a document writes an `Activity` row on the linked task:
- `action: 'doc_created'` / `'doc_updated'` / `'doc_deleted'`, `detail` carries the doc title.

No notifications are dispatched. This matches the agreed scope (activity yes, notifications no).

### Events

- `document:created`, `document:updated`, `document:deleted`, emitted with `boardId` scoping (same as `comment:*`).

### MCP

New `documents_*` tools in `mcp.service.ts` (`handleDocuments`) and `tool-definitions.ts`:

| Tool | Input | Notes |
| --- | --- | --- |
| `documents_list` | `boardId` *or* `taskId`, `limit?` | List excludes bodies by default. |
| `documents_get` | `id` | Full body + task info. |
| `documents_create` | `taskId`, `title`, `body?` | Writes `doc_created` activity. |
| `documents_update` | `id`, `title?`, `body?` | Writes `doc_updated` activity if changed. |
| `documents_delete` | `id` | Writes `doc_deleted` activity. |

No publish tool. MCP handlers write activity rows and emit the same events as REST.

### Public sharing

- `PublicService.findPublicDocument(identifier, number)` → `GET /api/public/docs/:identifier/:number`, marked `@Public()`.
- Hand-built `select`, never `include` — only title, body, `taskNumber`, task title/number, `updatedAt`, board identifier. No author, no board members, no task metadata.
- Returns 404 for both "no such document" and "not published" — indistinguishable, same as tasks.
- Distinct path prefix `docs` under `/public`, so no collision with `/public/tasks/:identifier/:number`.

## Web

### Types & API client

- `types/index.ts`: new `Document` interface: `id`, `boardId`, `taskId`, `number`, `docNumber` (`D-1` style), `taskNumber`, `title`, `body`, `isPublic`, `createdAt`, `updatedAt`.
- `hooks/api.ts`: `api.documents.*` — `listByBoard(boardId)`, `listByTask(taskId)`, `get(id)`, `create(taskId, { title, body })`, `update(id, { title?, body? })`, `delete(id)`, `publish(id)`, `unpublish(id)`.
- New `hooks/use-documents.ts`: `useDocumentsByBoard`, `useDocumentsByTask`, `useDocument`, `useCreateDocument`, `useUpdateDocument`, `useDeleteDocument`, `useSetDocumentPublic` — following `use-tasks.ts` conventions.
- `hooks/use-socket.ts`: register `document:created` / `document:updated` / `document:deleted` → invalidate `['documents', ...]` queries (by doc id, by board, by task).

### Pages & routes (under `SidebarLayout`)

- `/board/:boardId/docs` — board docs index: list of documents with title, task link (`TFG-123`), updated timestamp, and a published indicator (Fog `published`/`private` mono tag). Click → editor.
- `/board/:boardId/doc/:docId` — the full-page editor. Title editable inline, body via the existing `MarkdownEditor` with the same autosave (`createAutosaver` + flush on blur/unmount) as `DetailDescriptionEditor`. Header: "Back to task" link, delete + publish controls. Publishing copies the public URL (`/public/docs/:identifier/:number`) to the clipboard and confirms with a toast, mirroring task publishing. Unpublished state is indicated in the header.

### Task detail integration

- New `detail-documents.tsx` on `TaskDetailPage`: compact list of the task's docs (title + `D-<n>`), each linking to the full-page editor, plus a "New document" action.
- Task-card doc counts are out of scope (card width is tight).

### Design system

Follows `design.md`: Onyx canvas, card surfaces with inset Graphite borders, JetBrains Mono for doc numbers and timestamps, Fog/Slate text scale, one Lime action (the "New document" primary CTA). The editor reuses `MarkdownEditor` verbatim so the writing surface matches task descriptions.

## Verification

- `pnpm --filter @taskforge/api test` — new `documents.service.spec.ts` integration tests: create/read/update/delete, board doc numbering, cascade on task delete, publish/unpublish + bot rejection, public endpoint 404 semantics.
- `pnpm --filter @taskforge/web test` — hooks and `detail-documents` component tests.
- Web typecheck: `cd apps/web && npx tsc --noEmit` — must not grow past the existing 3 pre-existing errors.
- Prisma migration: `pnpm --filter @taskforge/api prisma:migrate -- --name documents`.

## Out of scope

- Notifications for document changes.
- Task-card doc counts.
- WYSIWYG editing beyond the existing `MarkdownEditor`.
- Multi-author / revision history on documents.
