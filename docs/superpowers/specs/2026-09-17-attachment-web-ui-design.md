# Attachment Web UI - Design

**Date:** 2026-09-17
**Task:** TFG-51
**Status:** Approved design - implementation plan to follow

## Purpose

Make the attachment infrastructure from TFG-50 usable in the browser for tasks,
comments, and documents. Admins can also configure the instance attachment size
limit and MIME allowlist.

## Scope

- Full task and document attachment sections with upload, download, metadata, and
  authorized deletion.
- Compact attachment chips under comments, with uploads during comment creation,
  editing, and replies.
- Admin-only attachment settings.
- React Query invalidation for local mutations and attachment socket events.
- A muted paperclip count on kanban cards with attachments.

## Architecture

Add `Attachment` and `AttachmentSubjectType` frontend types, and an
`api.attachments` client surface for multipart upload, metadata listing, download,
and deletion. Multipart uploads must omit the JSON content type while retaining the
existing bearer token; downloads use an authenticated request and save the returned
blob using the attachment filename.

Add attachment hooks for queries and mutations. Mutations invalidate the attachment
list and the affected entity query. Comments additionally invalidate their task's
comments and task queries; documents additionally invalidate their document and
parent task queries. The socket handler consumes `attachment:created` and
`attachment:deleted` payloads and performs the equivalent invalidations by subject
type and id.

Use two focused UI components:

- `AttachmentSection` is shared by task detail and document editor views. It owns
  the full upload control and metadata list.
- `AttachmentChips` renders compact comment attachments. Comment composer variants
  use the shared upload validation and upload mutation, then render the resulting
  chips below the comment body.

## Interaction and Permissions

The current settings query provides `maxFileSizeMb` and `allowedMimeTypes` for
client-side validation before an upload begins. Files larger than the configured
limit or whose MIME type is not exactly allowed show an actionable error and do not
issue a request. The API remains authoritative for every validation and permission
check.

Upload controls are hidden from viewer board members. Delete controls are visible
only to the uploader, a board admin, or a global admin. For legacy boards with no
member records, the UI allows uploads, matching the backend fallback. Download is
available to every authenticated user and is always treated as a download rather
than an inline preview.

Task and document sections show an upload button, loading state, and a compact list
of filename, MIME icon, formatted size, uploader, relative date, download action,
and authorized delete action. Comment attachments render as filename chips with
download and authorized delete actions. No image previews, public-page exposure, or
kanban-card drop targets are introduced.

Kanban cards show a muted paperclip plus count only when the hydrated task payload
has one or more attachments.

## Settings

Add an admin-only Attachments settings tab alongside Email, Users, and Invites. It
contains a number input for `maxFileSizeMb` and a textarea with one exact MIME type
per line for `allowedMimeTypes`. Before submitting, require an integer size of at
least one and a non-empty list where every trimmed entry matches
`^[a-z]+/[a-z0-9.+-]+$` case-insensitively. Submit the normalized MIME list in the
existing settings update payload.

## Design

Follow `design.md`: attachment actions are quiet outline or ghost controls, lists
use existing border-defined surfaces, technical file metadata uses the mono face,
and the page's existing primary CTA remains the sole Lime action. File-type icons
use the existing Lucide visual language and neutral/Indigo emphasis only.

## Testing

- API client tests for multipart request construction, authenticated download, and
  deletion.
- Component tests for file validation, upload success/error, metadata rendering,
  download, and delete visibility.
- Comment tests for attachment chips and each composer path.
- Document and task placement coverage plus the kanban card paperclip count.
- Settings tests for field rendering, client validation, and normalized update
  payload.
- Socket tests for attachment event invalidation by task, comment, and document
  subject.
- Confirm the existing TypeScript baseline does not grow and run formatting and web
  tests.
