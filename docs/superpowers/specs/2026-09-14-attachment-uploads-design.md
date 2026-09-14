# Attachment Upload Infrastructure — Design

**Date:** 2026-09-14
**Task:** TFG-50 (Upload Infrastructure)
**Status:** Approved design — implementation plan to follow

## Purpose

Let users attach files to any subject (tasks, comments, documents) via a
polymorphic link, stored on the local filesystem behind a storage-driver
interface so an S3-compatible driver can be added later and both offered to
consumers. This task ships the infrastructure only: schema, storage layer,
REST endpoints, MCP tools, settings fields, cascade wiring, and tests. The
frontend UI ships in a follow-up task.

## Decisions (from brainstorming)

| Question                | Decision                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| Scope                   | Infra only (TFG-50); UI planned separately                       |
| Storage                 | Local disk now, S3-compatible later, both offered to consumers   |
| Architecture            | Approach A: `StorageDriver` interface + env-picked driver        |
| Attach to               | Generic polymorphic (task / comment / document)                  |
| Size limit              | Configurable from instance settings, default 10 MB               |
| File types              | MIME allowlist, stored in settings                               |
| Download access         | Any authenticated user                                           |
| Upload/delete access    | Write-gated (board member write rights; viewer rejected)         |
| Deletion                | Hard delete (row + object)                                       |
| MCP surface             | Full CRUD incl. base64 upload (1 MiB cap)                        |
| REST transport          | Multipart POST, one file per request                             |
| Activity/notifications  | Activity rows only, no notifications                             |
| MIME allowlist location | Settings-stored (like max size)                                  |
| Settings UI             | API fields now, settings-page UI ships later with attachments UI |

## 1. Data model (Prisma)

New `Attachment` model:

- `id` — cuid PK
- `subjectType` — `"task" | "comment" | "document"`
- `subjectId` — subject id
- `filename` — original filename, sanitized on write
- `mimeType` — stored MIME string (validated against allowlist at upload)
- `sizeBytes` — Int
- `storageKey` — server-generated UUID + extension (e.g. `a1b2c3….pdf`);
  original filename never touches the storage path
- `uploaderId` — User FK, `onDelete: SetNull`
- `createdAt`

Indexes: `(subjectType, subjectId)`, `uploaderId`. No DB-level cascade from
subjects — subject deletion calls `AttachmentsService.deleteBySubject()`
explicitly so storage objects are removed too.

`Settings` model gains:

- `maxFileSizeMb Int @default(10)`
- `allowedMimeTypes String` — JSON array string, same pattern as
  `View.filters`

## 2. Storage layer

New `apps/api/src/storage/` module:

- `storage.types.ts` — `StorageDriver` interface:
  `put(key, source)`, `get(key): ReadableStream | Buffer`, `delete(key)`,
  `stat(key): { size } | null`.
- `local-disk.driver.ts` — implements the interface over `fs/promises`,
  rooted at `ATTACHMENTS_DIR` (env; default `<cwd>/data/attachments`;
  docker-compose sets `ATTACHMENTS_DIR=/data/attachments` under the existing
  `/data` volume). Flat keyspace, no directories, UUID names.
- `storage.module.ts` — `@Global()` module providing `STORAGE_DRIVER` token
  via factory. `process.env.STORAGE_DRIVER === 's3'` throws a clear error
  ("S3 driver not yet implemented") — the env knob exists but does not lie.
  Otherwise returns `LocalDiskDriver`.

`AttachmentsService` depends only on the `STORAGE_DRIVER` token. Adding S3
later = one new class + one factory branch; nothing else changes.

## 3. REST API — `attachments` module

Endpoints (all behind the global `AuthGuard`):

- `POST /api/:subjectType/:subjectId/attachments` — multipart, single `file`
  field. `subjectType` ∈ task | comment | document, validated. Resolves the
  subject, resolves its board (task → its board; comment/document → their
  task → board), applies write gate (non-viewer board member or global
  admin; viewer → 403). Multer streams to a temp dir, service then moves the
  object into the driver and writes the row. Returns the attachment DTO.
- `GET /api/attachments/:id` — streams the file. Any authenticated user.
  Headers: `Content-Type` (stored mime), `Content-Length`,
  `Content-Disposition: attachment; filename="..."` (RFC 5987 encoding for
  non-ASCII names), `Cache-Control: private, no-store`. `HEAD` supported.
- `GET /api/:subjectType/:subjectId/attachments` — list metadata (no bytes).
- `DELETE /api/attachments/:id` — uploader, board admin, or global admin
  (mirrors comment-delete semantics). Row + object removed.

Unknown subject type or missing subject → 404.

## 4. MCP tools

- `attachments_list(subjectType, subjectId)`
- `attachments_get_meta(id)`
- `attachments_upload(subjectType, subjectId, filename, mimeType,
base64Content)` — decoded payload capped at 1 MiB regardless of the larger
  web limit; size and MIME checks identical to REST. Funnel through the same
  `AttachmentsService.create()` used by REST.
- `attachments_delete(id)` — same gates as REST delete.

MCP never touches multipart.

## 5. Validation & settings

- Size ≤ `settings.maxFileSizeMb` (multer limits wired per-request from the
  settings row, so runtime admin changes apply without restart).
- MIME ∈ `settings.allowedMimeTypes` — exact match on the full MIME string,
  no wildcard matching in v1.
- Settings defaults: `maxFileSizeMb: 10`; allowlist: `image/png`,
  `image/jpeg`, `image/gif`, `image/webp`, `text/plain`, `text/markdown`,
  `text/csv`, `application/json`, `application/pdf`, `application/zip`.
  `image/svg+xml` deliberately excluded (XSS vector).
- Settings PATCH validation: `maxFileSizeMb` must be ≥ 1; allowlist must be a
  non-empty array of MIME strings matching `type/subtype` (regex
  `^[a-z]+/[a-z0-9.+-]+$`, case-insensitive).
- Downloads always `Content-Disposition: attachment` — never inline, even
  for images.

## 6. Activity, events, cascade

- Activity via existing `ActivityService`: `attachment_added`,
  `attachment_removed`; detail `{"filename": "...", "sizeBytes": N}`.
- No notifications — `isNotifying()` untouched.
- Socket events `attachment:created` / `attachment:deleted`, scoped to the
  subject's board via the opt-in `boardId` emit arg.
- Cascade: `TasksService.delete`, `CommentsService.delete`,
  `DocumentsService.delete` call `AttachmentsService.deleteBySubject()`.
  Rows deleted first, then best-effort object delete (failures logged, never
  block subject deletion).
- Payloads: task detail gains `attachments` metadata list; comment and
  document payloads gain theirs.

## 7. Testing & ops

- API integration tests with per-run temp `ATTACHMENTS_DIR` (mirrors
  `createTestPrisma()`): upload/list/download/delete round-trip, size limit,
  MIME allowlist, viewer write-gate rejection, MCP base64 path (incl. 1 MiB
  cap), cascade delete removes rows + objects, settings validation.
- Settings API tests: new fields round-trip, PATCH validation.
- Docker: `ATTACHMENTS_DIR=/data/attachments` in compose env + Dockerfile
  `ENV`; entrypoint untouched.
- MCP tool descriptions updated in `tool-definitions.ts`.

## Out of scope (follow-up tasks)

- Web UI: upload dropzone, attachment list, delete buttons (separate task,
  planned later).
- Settings-page UI for the two new fields (ships with the UI task).
- S3-compatible driver implementation (the interface and env knob are the
  only deliverables here).
- Public task page exposure of attachments.
