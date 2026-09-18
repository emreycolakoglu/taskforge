# Attachment Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users upload, download, and delete task, comment, and document attachments from the TaskForge web app, with admin-configurable limits.

**Architecture:** Extend the existing typed API client and React Query hooks with an attachment surface. Build one full attachment section for task/document placement and compact chips for comments, then wire each host component to the common primitives. Socket events invalidate the same entity queries as local mutations; settings provide the client validation policy but the API remains authoritative.

**Tech Stack:** React 19, TypeScript, TanStack React Query, Vitest, Testing Library, Lucide, shadcn/ui, Sonner.

## Global Constraints

- Follow `design.md`: dark-only, no gradients, no new accent colors, and no more than one Acid Lime CTA per screen.
- Use existing shadcn primitives and Lucide icons; add no dependency.
- Keep attachment downloads authenticated and downloaded as files, never rendered inline.
- Match API validation: `maxFileSizeMb` is an integer from 1 through 100; MIME entries are non-empty and match `^[a-z]+/[a-z0-9.+-]+$` case-insensitively.
- Do not expose attachments on public task or document pages.
- Preserve the existing TypeScript baseline: six pre-existing errors, with no new errors.
- Use kebab-case filenames and add focused Vitest coverage for every behavior below.

---

### Task 1: Attachment Types, API Client, and Query Hooks

**Files:**

- Modify: `apps/web/src/types/index.ts:31-69,109-121,189-213,231-245`
- Modify: `apps/web/src/hooks/api.ts:49-78,99-362`
- Create: `apps/web/src/hooks/use-attachments.ts`
- Modify: `apps/web/src/hooks/api.test.ts`
- Create: `apps/web/src/hooks/use-attachments.test.tsx`

**Interfaces:**

- Produces `AttachmentSubjectType = 'task' | 'comment' | 'document'` and `Attachment` with `id`, `subjectType`, `subjectId`, `filename`, `mimeType`, `sizeBytes`, `uploaderId`, `uploader`, and `createdAt`.
- Produces optional `attachments?: Attachment[]` on `Task`, `Comment`, and `Document`.
- Produces `api.attachments.list(subjectType, subjectId)`, `upload(subjectType, subjectId, file)`, `download(attachment)`, and `delete(id)`.
- Produces `useAttachments(subjectType, subjectId)`, `useUploadAttachment()`, and `useDeleteAttachment()`.

- [ ] **Step 1: Write failing API client tests for multipart upload, download, and delete.**

```ts
it('uploads a file as multipart with the bearer token and no JSON content type', async () => {
  localStorageMock.getItem.mockReturnValueOnce('token');
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => attachment });
  await api.attachments.upload(
    'task',
    't1',
    new File(['note'], 'note.txt', { type: 'text/plain' }),
  );
  const [, options] = mockFetch.mock.calls[0];
  expect(mockFetch).toHaveBeenCalledWith(
    '/api/task/t1/attachments',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(options.headers).toEqual({ Authorization: 'Bearer token' });
  expect(options.body).toBeInstanceOf(FormData);
  expect((options.body as FormData).get('file')).toBeInstanceOf(File);
});

it('downloads an attachment as a named blob with authorization', async () => {
  localStorageMock.getItem.mockReturnValueOnce('token');
  mockFetch.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['note']) });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await api.attachments.download(attachment);
  expect(mockFetch).toHaveBeenCalledWith('/api/attachments/a1', {
    headers: { Authorization: 'Bearer token' },
  });
  expect(click).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the API client test to verify it fails.**

Run: `cd apps/web && npx vitest run src/hooks/api.test.ts`

Expected: FAIL because `api.attachments` does not exist.

- [ ] **Step 3: Add types and a multipart-capable request path.**

```ts
export type AttachmentSubjectType = 'task' | 'comment' | 'document';

export interface Attachment {
  id: string;
  subjectType: AttachmentSubjectType;
  subjectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string | null;
  uploader: Pick<User, 'id' | 'displayName'> | null;
  createdAt: string;
}

async function formRequest<T>(url: string, body: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Add `api.attachments` methods using `formRequest`, `request`, and a dedicated blob download request that creates an object URL, clicks an `<a download={attachment.filename}>`, and revokes the URL.

- [ ] **Step 4: Add hooks and mutation invalidation tests.**

```ts
export function useAttachments(subjectType: AttachmentSubjectType, subjectId: string) {
  return useQuery({
    queryKey: ['attachments', subjectType, subjectId],
    queryFn: () => api.attachments.list(subjectType, subjectId),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectType, subjectId, file }: UploadAttachmentInput) =>
      api.attachments.upload(subjectType, subjectId, file),
    onSuccess: (attachment) => invalidateAttachmentSubject(queryClient, attachment),
  });
}
```

Define and export `invalidateAttachmentSubject(queryClient, attachment)` in this module. It must invalidate `['attachments', subjectType, subjectId]`, task queries for task subjects, comments plus task queries for comment subjects when a `taskId` is provided by the caller, and document plus task queries for document subjects when `documentId`/`taskId` are provided. Test each query-key set with a mocked query client.

- [ ] **Step 5: Run focused client and hook tests.**

Run: `cd apps/web && npx vitest run src/hooks/api.test.ts src/hooks/use-attachments.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the foundation.**

```bash
git add apps/web/src/types/index.ts apps/web/src/hooks/api.ts apps/web/src/hooks/use-attachments.ts apps/web/src/hooks/api.test.ts apps/web/src/hooks/use-attachments.test.tsx
```

### Task 2: Shared Attachment UI and Task/Document Placement

**Files:**

- Create: `apps/web/src/components/attachment-section.tsx`
- Create: `apps/web/src/components/attachment-section.test.tsx`
- Modify: `apps/web/src/components/task-detail-view.tsx:11-36,187-223`
- Modify: `apps/web/src/pages/document-editor-page.tsx:10-35,197-221`
- Modify: `apps/web/src/pages/task-detail-page.test.tsx`
- Modify: `apps/web/src/pages/document-editor-page.test.tsx`

**Interfaces:**

- Consumes `Attachment`, `AttachmentSubjectType`, `useAttachments`, `useUploadAttachment`, `useDeleteAttachment`, `useSettings`, `useAuth`, and optionally `useMembers`.
- Produces `<AttachmentSection subjectType subjectId boardId taskId?>` for task and document placements.

- [ ] **Step 1: Write failing component tests for list metadata, validation, upload, and delete permissions.**

```tsx
it('rejects a file that exceeds the current max size without uploading', async () => {
  renderSection({ maxFileSizeMb: 1, allowedMimeTypes: ['text/plain'] });
  const file = new File([new Uint8Array(1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' });
  await userEvent.upload(screen.getByLabelText('Upload attachment'), file);
  expect(mockUpload).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('File exceeds the 1 MB limit');
});

it('shows delete only for the uploader, board admin, or global admin', () => {
  renderSection({
    user: { id: 'u2', role: 'member' },
    members: [{ userId: 'u2', role: 'member' }],
  });
  expect(screen.queryByLabelText('Delete report.pdf')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test to verify it fails.**

Run: `cd apps/web && npx vitest run src/components/attachment-section.test.tsx`

Expected: FAIL because `AttachmentSection` does not exist.

- [ ] **Step 3: Implement the section and its validation helpers.**

```tsx
export function AttachmentSection({
  subjectType,
  subjectId,
  boardId,
  taskId,
}: AttachmentSectionProps) {
  const { data: settings } = useSettings();
  const { data: attachments = [] } = useAttachments(subjectType, subjectId);
  const upload = useUploadAttachment();

  const selectFile = (file: File) => {
    const error = validateAttachmentFile(file, settings);
    if (error) return toast.error(error);
    upload.mutate({ subjectType, subjectId, boardId, taskId, file });
  };

  return <section aria-label="Attachments">{/* file input, rows, actions */}</section>;
}
```

`validateAttachmentFile(file, settings)` must reject absent settings only by deferring to the API, reject files exceeding `maxFileSizeMb * 1024 * 1024`, and reject a MIME type not in `allowedMimeTypes`. Format sizes with base-1024 units and use Lucide file icons selected by MIME family. Render uploader display name or `Unknown`, relative date, download button, and an authorized delete button. Use a visually-hidden file input associated with an `Upload attachment` label; leave OS-card drag and drop out of scope.

- [ ] **Step 4: Place the reusable section on both hosts.**

```tsx
<AttachmentSection subjectType="task" subjectId={task.id} boardId={boardId} taskId={task.id} />
```

Insert it in `TaskDetailView` after `DetailDocuments` and before `DetailActivity`. In `DocumentEditorPage`, render it after `MarkdownEditor` inside the existing `max-w-3xl` content column with `subjectType="document"`, `subjectId={doc.id}`, `boardId={doc.boardId}`, and `taskId={doc.taskId}`.

- [ ] **Step 5: Extend host tests and rerun focused coverage.**

Run: `cd apps/web && npx vitest run src/components/attachment-section.test.tsx src/pages/task-detail-page.test.tsx src/pages/document-editor-page.test.tsx`

Expected: PASS, including attachment section placement on task and document pages.

- [ ] **Step 6: Commit shared UI and placement.**

```bash
git add apps/web/src/components/attachment-section.tsx apps/web/src/components/attachment-section.test.tsx apps/web/src/components/task-detail-view.tsx apps/web/src/pages/document-editor-page.tsx apps/web/src/pages/task-detail-page.test.tsx apps/web/src/pages/document-editor-page.test.tsx
```

### Task 3: Comment Attachment Chips and Composer Uploads

**Files:**

- Create: `apps/web/src/components/attachment-chips.tsx`
- Create: `apps/web/src/components/attachment-chips.test.tsx`
- Modify: `apps/web/src/components/detail-comments.tsx:32-69,95-117,257-322,397-423`
- Modify: `apps/web/src/components/detail-comments.test.tsx`
- Modify: `apps/web/src/components/task-detail-view.tsx:84-114`
- Modify: `apps/web/src/hooks/use-comments.ts:12-56`

**Interfaces:**

- Consumes `AttachmentSection` file-validation export, `Attachment`, and attachment mutations.
- Produces `<AttachmentChips attachments subjectId boardId taskId>`.
- Extends comment submit/update callbacks so a composer can submit a body and pending `File[]`.

- [ ] **Step 1: Write failing tests for chips and queued composer uploads.**

```tsx
it('uploads files only after creating a new comment', async () => {
  const onSubmit = vi.fn().mockResolvedValue({ id: 'c-new' });
  render(<DetailComments comments={[]} onSubmit={onSubmit} formatTimestamp={(value) => value} />);
  await userEvent.upload(
    screen.getByLabelText('Attach to comment'),
    new File(['x'], 'note.txt', { type: 'text/plain' }),
  );
  await userEvent.type(screen.getByPlaceholderText('Add a comment…'), 'Body');
  await userEvent.click(screen.getByRole('button', { name: 'Submit comment' }));
  expect(onSubmit).toHaveBeenCalledWith('Body', undefined, [expect.any(File)]);
});

it('renders a comment attachment chip with its filename and download action', () => {
  render(<AttachmentChips attachments={[attachment]} subjectId="c1" boardId="b1" taskId="t1" />);
  expect(screen.getByText('report.pdf')).toBeInTheDocument();
  expect(screen.getByLabelText('Download report.pdf')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the comment tests to verify they fail.**

Run: `cd apps/web && npx vitest run src/components/attachment-chips.test.tsx src/components/detail-comments.test.tsx`

Expected: FAIL because comment attachment controls and callback parameters do not exist.

- [ ] **Step 3: Implement chips and pending-file composer state.**

```ts
type SubmitComment = (body: string, parentId?: string, files?: File[]) => Promise<Comment | void>;

const [files, setFiles] = useState<File[]>([]);

const submit = async () => {
  if (!text.trim()) return;
  await onSubmit(text.trim(), undefined, files);
  setText('');
  setFiles([]);
};
```

Use this pattern for root, reply, and edit composers. Root/reply creation must await the comment mutation, then upload each selected file to the returned comment id. Edit uploads target the existing comment id after the body update resolves. Preserve selected files and text if comment creation/update or any upload fails; show the existing mutation error plus a file-specific error. Do not attempt an upload before a new comment has a server id.

Render `AttachmentChips` below each non-tombstoned comment body. It should reuse file metadata formatting, download behavior, and delete authorization from the full section, while presenting only a compact chip row.

- [ ] **Step 4: Make comment mutations return the created/updated comment and upload queued files in `TaskDetailView`.**

```ts
const handleAddComment = async (body: string, parentId?: string, files: File[] = []) => {
  if (!task) return;
  const comment = await createComment.mutateAsync({
    taskId: task.id,
    author: 'user',
    body,
    parentId,
  });
  await Promise.all(
    files.map((file) =>
      uploadAttachment.mutateAsync({
        subjectType: 'comment',
        subjectId: comment.id,
        boardId,
        taskId: task.id,
        file,
      }),
    ),
  );
  return comment;
};
```

Apply the same sequence for comment edits, using the existing comment id after `updateComment.mutateAsync`. Update hook typings from `mutate`-only consumers to expose the standard `mutateAsync` API without altering existing optimistic behavior.

- [ ] **Step 5: Run focused comment coverage.**

Run: `cd apps/web && npx vitest run src/components/attachment-chips.test.tsx src/components/detail-comments.test.tsx src/hooks/use-comments.test.tsx`

Expected: PASS for root, reply, and edit attachment paths, chip rendering, download, and delete gating.

- [ ] **Step 6: Commit comment attachments.**

```bash
git add apps/web/src/components/attachment-chips.tsx apps/web/src/components/attachment-chips.test.tsx apps/web/src/components/detail-comments.tsx apps/web/src/components/detail-comments.test.tsx apps/web/src/components/task-detail-view.tsx apps/web/src/hooks/use-comments.ts apps/web/src/hooks/use-comments.test.tsx
```

### Task 4: Attachment Settings, Socket Events, and Kanban Badge

**Files:**

- Modify: `apps/web/src/pages/settings-page.tsx:1-39,385-608`
- Modify: `apps/web/src/pages/settings-page.test.tsx`
- Modify: `apps/web/src/hooks/use-socket.ts:105-235`
- Modify: `apps/web/src/hooks/use-socket.test.ts`
- Modify: `apps/web/src/components/task-card.tsx:21-32,73-79,118-198`
- Modify: `apps/web/src/components/task-card.test.tsx`

**Interfaces:**

- Consumes `Settings.maxFileSizeMb`, `Settings.allowedMimeTypes`, and matching optional fields on `UpdateSettingsPayload`.
- Produces an admin-only Attachments settings tab and attachment socket event invalidation.

- [ ] **Step 1: Write failing settings, socket, and card tests.**

```tsx
it('rejects an empty MIME type list and does not save', async () => {
  render(<SettingsPage />);
  await userEvent.click(screen.getByRole('tab', { name: 'Attachments' }));
  await userEvent.clear(screen.getByLabelText('Allowed MIME types'));
  await userEvent.click(screen.getByRole('button', { name: 'Save attachment settings' }));
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByText('Enter at least one MIME type.')).toBeInTheDocument();
});

it('invalidates a comment attachment event through the parent task queries', () => {
  renderHook(() => useSocket());
  attachmentCreatedHandler({ subjectType: 'comment', subjectId: 'c1' });
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['comments'] });
});

it('shows the attachment count only when the task has attachments', () => {
  renderWithClient(<TaskCard task={makeTask({ attachments: [attachment] })} />);
  expect(screen.getByLabelText('1 attachment')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests to verify they fail.**

Run: `cd apps/web && npx vitest run src/pages/settings-page.test.tsx src/hooks/use-socket.test.ts src/components/task-card.test.tsx`

Expected: FAIL because attachment fields, events, and the card badge are absent.

- [ ] **Step 3: Extend settings types and implement the admin tab.**

```ts
const MIME_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i;
const mimeTypes = form.allowedMimeTypes
  .split('\n')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!Number.isInteger(size) || size < 1 || size > 100)
  setError('File size must be a whole number from 1 to 100.');
else if (mimeTypes.length === 0) setError('Enter at least one MIME type.');
else if (mimeTypes.some((value) => !MIME_TYPE.test(value)))
  setError('Each MIME type must use type/subtype format.');
else updateSettings.mutate({ maxFileSizeMb: size, allowedMimeTypes: mimeTypes });
```

Add `maxFileSizeMb: number` and `allowedMimeTypes: string[]` to `Settings`, plus optional counterparts to `UpdateSettingsPayload`. The Attachments tab is rendered only for `user.role === 'admin'`, initializes from settings, and uses an explicit `Save attachment settings` label to disambiguate it from SMTP save controls.

- [ ] **Step 4: Register and invalidate attachment socket events.**

```ts
if (eventName === 'attachment:created' || eventName === 'attachment:deleted') {
  const attachment = eventData as { subjectType?: AttachmentSubjectType; subjectId?: string };
  if (attachment.subjectType && attachment.subjectId) {
    queryClient.invalidateQueries({
      queryKey: ['attachments', attachment.subjectType, attachment.subjectId],
    });
    if (attachment.subjectType === 'task')
      queryClient.invalidateQueries({ queryKey: ['tasks', attachment.subjectId] });
    if (attachment.subjectType === 'comment')
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    if (attachment.subjectType === 'document')
      queryClient.invalidateQueries({ queryKey: ['documents', attachment.subjectId] });
  }
}
```

Add both event names to `eventTypes`. For comments, invalidate the broad `['comments']` prefix because the event deliberately contains only the attachment subject, not its task id; that catches every cached task-specific comments query. For documents, also invalidate the broad `['documents']` prefix so board/task document lists receive the hydrated attachment update.

- [ ] **Step 5: Add the task-card badge.**

```tsx
{
  task.attachments?.length ? (
    <Badge
      variant="outline"
      className="shrink-0"
      aria-label={`${task.attachments.length} attachment${task.attachments.length === 1 ? '' : 's'}`}
    >
      <Paperclip className="size-3" />
      {task.attachments.length}
    </Badge>
  ) : null;
}
```

Include attachment presence in `hasRow2`. Keep it in the existing muted metadata row and do not add Lime.

- [ ] **Step 6: Run focused settings, socket, and card tests.**

Run: `cd apps/web && npx vitest run src/pages/settings-page.test.tsx src/hooks/use-socket.test.ts src/components/task-card.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the integration work.**

```bash
git add apps/web/src/types/index.ts apps/web/src/pages/settings-page.tsx apps/web/src/pages/settings-page.test.tsx apps/web/src/hooks/use-socket.ts apps/web/src/hooks/use-socket.test.ts apps/web/src/components/task-card.tsx apps/web/src/components/task-card.test.tsx
```

### Task 5: Whole-Web Verification and Documentation

**Files:**

- Modify: `docs/superpowers/specs/2026-09-17-attachment-web-ui-design.md` only if implementation differs from approved design

**Interfaces:**

- Consumes all completed attachment UI changes.
- Produces verified TFG-51 behavior without a TypeScript regression.

- [ ] **Step 1: Run the complete web test suite.**

Run: `pnpm --filter @taskforge/web test`

Expected: PASS.

- [ ] **Step 2: Run the explicit web typecheck and record the baseline count.**

Run: `cd apps/web && npx tsc --noEmit`

Expected: exactly the six known pre-existing errors and no attachment-related errors.

- [ ] **Step 3: Check formatting.**

Run: `pnpm format:check`

Expected: PASS. If it fails only for changed files, run `pnpm format` and rerun the check.

- [ ] **Step 4: Build the web app.**

Run: `pnpm --filter @taskforge/web build`

Expected: PASS.

- [ ] **Step 5: Review the completed diff and commit verification changes if any.**

```bash
git diff --check
```
