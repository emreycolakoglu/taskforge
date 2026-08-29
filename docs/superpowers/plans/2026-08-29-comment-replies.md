# Comment Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow task comments to be replied to with unlimited nesting, across REST API, web UI, MCP, and the public task page, using tombstone deletion to preserve thread structure.

**Architecture:** Adjacency list (`Comment.parentId` self-relation) + in-memory tree build in `CommentsService.findByTask`. Deletes hard-delete leaf comments but tombstone parents (set `deletedAt`, blank `body`) so replies keep their parent. The web UI consumes the tree directly; the public payload is a pruned copy of the same tree with tombstones omitted and orphaned replies promoted to top level.

**Tech Stack:** NestJS 11 + Prisma 6 (SQLite), React 19 + Vitest — monorepo `apps/api` (CommonJS, `strict: false`) and `apps/web` (ESM, `strict: true`).

**Spec:** `docs/superpowers/specs/2026-08-29-comment-replies-design.md`

## Global Constraints

- Design system: read `design.md` before any `apps/web/` change. No Lime on comments UI (composer stays `outline`, not primary). Inter weights ≤ 590, JetBrains Mono for counts/timestamps, no gradients, Graphite borders for nesting lines.
- API is CommonJS, Web is ESM — don't copy import patterns between apps.
- Do not add `strict: true` to `apps/api/tsconfig.json`.
- Prettier is canonical: run `pnpm format:check` before committing (or `pnpm format`). `.prettierignore` already covers generated dirs.
- No ESLint config exists; `pnpm lint` fails — never run it.
- Web build does NOT typecheck: run `cd apps/web && npx tsc --noEmit` explicitly. Baseline is exactly 3 pre-existing errors; confirm the count doesn't grow.
- API tests are integration-level against a real temp SQLite DB; each test file cleans tables in `afterEach` in reverse dependency order — keep that order intact.
- Kebab-case filenames. Always write unit tests.
- Board identifier rule (3 uppercase letters) is unrelated here — don't touch `CreateBoardDto`.

---

### Task 1: Prisma schema — `parentId` + `deletedAt` on Comment

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Comment model, ~lines 211–226)

**Interfaces:**

- Produces: `Comment.parentId: string | null`, `Comment.deletedAt: Date | null`, Prisma relation accessors `parent` / `replies` on the generated client. All later tasks consume these.

- [ ] **Step 1: Add the columns and self-relation to the Comment model**

Edit `apps/api/prisma/schema.prisma`, replacing the existing `Comment` model with:

```prisma
model Comment {
  id        String    @id @default(cuid())
  taskId    String
  parentId  String?
  authorId  String?
  author    String
  body      String
  editedAt  DateTime?
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  task    Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  parent  Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: SetNull)
  replies Comment[] @relation("CommentReplies")
  authorRel User?   @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  reactions CommentReaction[]

  @@index([authorId])
  @@index([parentId])
}
```

Note: `@@index([parentId])` is added so child lookups in `remove`/`create` validation are indexed. `onDelete: SetNull` on `parent` is a safety net only — deletes never hard-delete when children exist (Task 2 makes that unconditional in both REST and MCP paths).

- [ ] **Step 2: Create the migration and regenerate the client**

Run from repo root:

```bash
pnpm db:migrate -- --name comment_replies
```

Then confirm the generated client knows the field:

```bash
pnpm --filter @taskforge/api exec prisma generate
```

Expected: migration created under `apps/api/prisma/migrations/2026*_comment_replies/migration.sql` containing two `ALTER TABLE "Comment"` statements (`parentId TEXT`, `deletedAt DATETIME`) plus one `CREATE INDEX`. The dev server will crash if the client wasn't generated — this step prevents that.

- [ ] **Step 3: Verify existing suite still passes**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=comments
```

Expected: all existing `comments.service.spec.ts` tests PASS (Prisma adds nullable columns without a default — existing seeds are unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add parentId and deletedAt to Comment for threaded replies"
```

---

### Task 2: CommentsService — tree build, reply validation, tombstone delete

**Files:**

- Modify: `apps/api/src/comments/dto/comment.dto.ts`
- Modify: `apps/api/src/comments/comments.service.ts`
- Modify: `apps/api/test/setup.ts` (`seedComment`, ~line 147)
- Test: `apps/api/src/comments/comments.service.spec.ts`

**Interfaces:**

- Consumes: Prisma client from Task 1 (`parentId`, `deletedAt`, `replies` relation).
- Produces (all later tasks rely on these exact shapes):
  - `CommentsService.findByTask(taskId)` returns `CommentNode[]` where each node is the existing comment shape plus `replies: CommentNode[]` (roots: `createdAt` desc; replies within a thread: `createdAt` asc).
  - `CommentsService.create(dto)` accepts `dto.parentId?: string`; throws `BadRequestException('Invalid parent comment')` when the parent is missing or belongs to another task.
  - `CommentsService.remove(id, user?)` hard-deletes leaves, tombstones comments with children (sets `deletedAt`, blanks `body`).
  - `CommentsService.update(id, ...)` throws `BadRequestException('Cannot edit a deleted comment')` for tombstones.

- [ ] **Step 1: Update the seed helper to accept any override**

In `apps/api/test/setup.ts`, replace the body of `seedComment` so overrides (including `parentId` and `deletedAt`) reach the database:

```ts
/**
 * Seed a comment on a task. Overrides spread over the defaults —
 * pass `parentId` to seed a reply, `deletedAt` to seed a tombstone.
 */
export async function seedComment(
  prisma: PrismaClient,
  taskId: string,
  overrides: Record<string, any> = {},
) {
  return prisma.comment.create({
    data: {
      taskId,
      authorId: overrides.authorId ?? null,
      author: overrides.author || 'tester',
      body: overrides.body || 'Test comment',
      ...overrides,
    },
  });
}
```

(Explicit fields first so required columns still error clearly if an override nulls one; the spread is last so any override, e.g. `parentId`, wins.)

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/comments/comments.service.spec.ts` inside the top-level `describe('CommentsService', …)` (after the existing `findByTask reactions` describe):

```ts
describe('threaded replies', () => {
  describe('create', () => {
    it('creates a reply with a valid parentId', async () => {
      const parent = await service.create({ taskId: task.id, body: 'parent' }, user);
      const reply = await service.create(
        { taskId: task.id, body: 'child', parentId: parent.id },
        user,
      );
      expect(reply.parentId).toBe(parent.id);
    });

    it('rejects a parentId belonging to another task', async () => {
      const otherTask = await seedTask(prisma, board.statuses[0].id);
      const parent = await service.create({ taskId: otherTask.id, body: 'parent' }, user);
      await expect(
        service.create({ taskId: task.id, body: 'child', parentId: parent.id }, user),
      ).rejects.toThrow('Invalid parent comment');
    });

    it('rejects a missing parentId', async () => {
      await expect(
        service.create({ taskId: task.id, body: 'child', parentId: 'nope' }, user),
      ).rejects.toThrow('Invalid parent comment');
    });

    it('allows replying to a tombstoned comment', async () => {
      const parent = await seedComment(prisma, task.id, { body: 'parent' });
      await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
      await service.remove(parent.id);
      const reply = await service.create(
        { taskId: task.id, body: 'late reply', parentId: parent.id },
        user,
      );
      expect(reply.parentId).toBe(parent.id);
    });
  });

  describe('findByTask', () => {
    it('returns a nested tree: roots newest-first, replies oldest-first', async () => {
      const root1 = await service.create({ taskId: task.id, body: 'root1' }, user);
      await new Promise((r) => setTimeout(r, 5));
      const root2 = await service.create({ taskId: task.id, body: 'root2' }, user);
      await new Promise((r) => setTimeout(r, 5));
      const reply1 = await service.create(
        { taskId: task.id, body: 'reply1', parentId: root1.id },
        user,
      );
      await new Promise((r) => setTimeout(r, 5));
      await service.create({ taskId: task.id, body: 'reply2', parentId: root1.id }, user);
      await new Promise((r) => setTimeout(r, 5));
      await service.create({ taskId: task.id, body: 'deep', parentId: reply1.id }, user);

      const tree = await service.findByTask(task.id);
      expect(tree.map((c) => c.body)).toEqual(['root2', 'root1']);
      const replies = tree[1].replies;
      expect(replies.map((c) => c.body)).toEqual(['reply1', 'reply2']);
      expect(replies[0].replies.map((c) => c.body)).toEqual(['deep']);
      expect(tree[1].replies[1].replies).toEqual([]);
    });

    it('promotes orphaned replies to roots (defensive; parents are same-task by validation)', async () => {
      await seedComment(prisma, task.id, { body: 'orphan', parentId: 'missing-parent' });
      const tree = await service.findByTask(task.id);
      expect(tree).toHaveLength(1);
      expect(tree[0].body).toBe('orphan');
      expect(tree[0].replies).toEqual([]);
    });
  });

  describe('remove with replies', () => {
    it('tombstones a comment with replies: keeps the row, blanks body, sets deletedAt', async () => {
      const parent = await seedComment(prisma, task.id, { body: 'parent' });
      await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });

      await service.remove(parent.id);

      const stored = await prisma.comment.findUnique({ where: { id: parent.id } });
      expect(stored).not.toBeNull();
      expect(stored!.deletedAt).not.toBeNull();
      expect(stored!.body).toBe('');
      expect(stored!.author).toBe('tester');

      const tree = await service.findByTask(task.id);
      expect(tree).toHaveLength(1);
      expect(tree[0].deletedAt).not.toBeNull();
      expect(tree[0].replies.map((c) => c.body)).toEqual(['child']);
    });

    it('hard-deletes a leaf comment (existing behavior preserved)', async () => {
      const leaf = await seedComment(prisma, task.id, { body: 'leaf' });
      await service.remove(leaf.id);
      const stored = await prisma.comment.findUnique({ where: { id: leaf.id } });
      expect(stored).toBeNull();
    });

    it('emits comment:deleted and logs activity for a tombstone too', async () => {
      const parent = await seedComment(prisma, task.id, { body: 'parent' });
      await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'comment:deleted') emitted.push(payload);
      });

      await service.remove(parent.id);
      subscription.unsubscribe();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].data).toEqual({ id: parent.id, taskId: task.id });
      const activity = await prisma.activity.findMany({
        where: { taskId: task.id, action: 'deleted_comment' },
      });
      expect(activity).toHaveLength(1);
    });
  });

  describe('update on tombstone', () => {
    it('rejects editing a tombstoned comment', async () => {
      const parent = await seedComment(prisma, task.id, { body: 'parent' });
      await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
      await service.remove(parent.id);
      await expect(service.update(parent.id, 'nope', user)).rejects.toThrow(
        'Cannot edit a deleted comment',
      );
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=comments
```

Expected: FAIL — new tests error (no `parentId` filtering, `findByTask` returns a flat list, remove hard-deletes, update lacks tombstone guard). Existing tests still pass.

- [ ] **Step 4: Add `parentId` to `CreateCommentDto`**

In `apps/api/src/comments/dto/comment.dto.ts`:

```ts
export class CreateCommentDto {
  @IsString()
  taskId: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsString()
  body: string;
}
```

- [ ] **Step 5: Implement the service changes**

In `apps/api/src/comments/comments.service.ts`:

**(a) `findByTask` — replace the whole method with the tree build:**

```ts
  /**
   * All comments for a task as a nested tree. Roots are newest-first;
   * replies within a thread are oldest-first (reading order). Replies whose
   * parent is missing from the fetch (defensive — validation keeps parents
   * same-task) surface as roots so no comment is ever dropped.
   */
  async findByTask(taskId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    const byId = new Map<string, (typeof comments)[number] & { replies: any[] }>();
    for (const c of comments) {
      byId.set(c.id, { ...c, reactions: groupReactions(c.reactions), replies: [] });
    }

    const roots: Array<(typeof comments)[number] & { replies: any[] }> = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    }
    for (const node of byId.values()) {
      node.replies.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return roots;
  }
```

**(b) `create` — validate the parent and store it.** Change the method signature destructure and add validation at the top; add `parentId` to the `data`:

```ts
  async create(dto: CreateCommentDto, user?: { id: string; displayName: string }) {
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.taskId !== dto.taskId) {
        throw new BadRequestException('Invalid parent comment');
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId: dto.taskId,
        parentId: dto.parentId ?? null,
        authorId: user?.id ?? dto.authorId ?? null,
        author: user?.displayName ?? dto.author ?? 'system',
        body: dto.body,
      },
    });
```

Everything after the `create` call in `create()` (activity, notifications, event) is unchanged.

**(c) `remove` — tombstone parents.** Replace the `await this.prisma.comment.delete({ where: { id } });` line with:

```ts
const childCount = await this.prisma.comment.count({ where: { parentId: id } });
if (childCount > 0) {
  // Tombstone: keep the row so children's parentId still resolves. The
  // body is blanked and deletedAt set; the UI renders a muted marker.
  await this.prisma.comment.update({
    where: { id },
    data: { deletedAt: new Date(), body: '' },
  });
} else {
  await this.prisma.comment.delete({ where: { id } });
}
```

The activity + event code that follows stays unchanged and applies to both paths.

**(d) `update` — reject tombstones.** Right after the `NotFoundException` check at the top of `update`, add:

```ts
if (comment.deletedAt) {
  throw new BadRequestException('Cannot edit a deleted comment');
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=comments
```

Expected: PASS — all prior tests plus the new threaded-replies tests.

- [ ] **Step 7: Format and commit**

```bash
pnpm format:check
git add apps/api/src/comments apps/api/test/setup.ts
git commit -m "feat(api): threaded comments — tree findByTask, reply validation, tombstone delete"
```

---

### Task 3: MCP — `comments_create` parentId, tombstoning delete, tool docs

**Files:**

- Modify: `apps/api/src/mcp/mcp.service.ts` (`handleComments`, ~lines 606–676)
- Modify: `apps/api/src/mcp/tool-definitions.ts` (`comments_list`, `comments_create`, `comments_delete`, ~lines 206–248)
- Test: `apps/api/src/mcp/mcp.service.spec.ts`

**Interfaces:**

- Consumes: Nothing new — MCP keeps its own inline prisma calls (existing pattern; `CommentsService` shared methods are used for update/react already).
- Produces: MCP `comments_create` accepts optional `parentId` (same validation — throws `Error('Invalid parent comment')`), `comments_delete` tombstones parents, `comments_list` returns the tree (via Task 2's `findByTask`).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/mcp/mcp.service.spec.ts`, inside `describe('comments_create', …)` add:

```ts
it('creates a reply when parentId targets a same-task comment', async () => {
  const task = await seedTask(prisma, board.statuses[0].id);
  const parent = await service.handleRequest(
    { method: 'comments_create', params: { taskId: task.id, body: 'parent' }, id: 240 },
    user,
  );
  const reply = await service.handleRequest(
    {
      method: 'comments_create',
      params: { taskId: task.id, body: 'reply', parentId: parent.result.id },
      id: 241,
    },
    user,
  );
  expect(reply.result.parentId).toBe(parent.result.id);

  const otherTask = await seedTask(prisma, board.statuses[0].id);
  await expect(
    service.handleRequest(
      {
        method: 'comments_create',
        params: { taskId: otherTask.id, body: 'cross-task', parentId: parent.result.id },
        id: 242,
      },
      user,
    ),
  ).rejects.toThrow('Invalid parent comment');
});
```

Inside `describe('comments_delete', …)` add:

```ts
it('tombstones a comment with replies instead of deleting it', async () => {
  const task = await seedTask(prisma, board.statuses[0].id);
  const parent = await seedComment(prisma, task.id, { authorId: user.id });
  await seedComment(prisma, task.id, { parentId: parent.id });

  const res = await service.handleRequest(
    { method: 'comments_delete', params: { id: parent.id }, id: 250 },
    user,
  );

  expect(res.result.success).toBe(true);
  const stored = await prisma.comment.findUnique({ where: { id: parent.id } });
  expect(stored).not.toBeNull();
  expect(stored!.deletedAt).not.toBeNull();
  expect(stored!.body).toBe('');
});
```

Inside `describe('comments_list', …)` add:

```ts
it('returns comments as a nested tree', async () => {
  const task = await seedTask(prisma, board.statuses[0].id);
  const parent = await seedComment(prisma, task.id);
  const child = await seedComment(prisma, task.id, { parentId: parent.id });
  const res = await service.handleRequest(
    { method: 'comments_list', params: { taskId: task.id }, id: 251 },
    user,
  );
  expect(res.result).toHaveLength(1);
  expect(res.result[0].replies).toHaveLength(1);
  expect(res.result[0].replies[0].id).toBe(child.id);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service
```

Expected: the three new tests FAIL (`comments_list` flat, delete hard-deletes, `parentId` ignored).

- [ ] **Step 3: Implement in `mcp.service.ts`.**

In `case 'create':` of `handleComments`, add validation and store the parent:

```ts
      case 'create': {
        if (params.parentId) {
          const parent = await this.prisma.comment.findUnique({
            where: { id: params.parentId },
          });
          if (!parent || parent.taskId !== params.taskId) {
            throw new Error('Invalid parent comment');
          }
        }
        const comment = await this.prisma.comment.create({
          data: {
            taskId: params.taskId,
            parentId: params.parentId ?? null,
            authorId: actorId,
            author: authorName,
            body: params.body,
          },
        });
```

(Remainder of the `create` case unchanged.)

In `case 'delete':`, replace the `await this.prisma.comment.delete({ where: { id: params.id } });` line with:

```ts
const childCount = await this.prisma.comment.count({ where: { parentId: params.id } });
if (childCount > 0) {
  await this.prisma.comment.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), body: '' },
  });
} else {
  await this.prisma.comment.delete({ where: { id: params.id } });
}
```

(Activity + event code around it unchanged.)

- [ ] **Step 4: Update tool definitions**

In `apps/api/src/mcp/tool-definitions.ts`:

- `comments_list` description → `'List comments on a task as a threaded tree: top-level comments newest-first, replies nested under parents oldest-first. Tombstoned (deleted) comments come back with body "" and a deletedAt timestamp.'`
- `comments_create` description → `'Add a comment to a task, attributed to the authenticated user. To reply, set parentId to the comment being replied to (must be on the same task).'`
- `comments_create` inputSchema gains the optional field:

```ts
    inputSchema: {
      taskId: idField('Task'),
      body: z.string(),
      parentId: z.string().optional().describe('Id of the comment being replied to'),
    },
```

- `comments_delete` description → `'Delete a comment by its id. Only the author or an admin can delete. Anonymous (MCP bot) comments require admin. Comments that have replies are tombstoned (body blanked, deletedAt set) so the thread structure survives; leaf comments are removed outright.'`

- [ ] **Step 5: Run to verify pass**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service
```

Expected: PASS (new tests green, existing comment/task tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mcp
git commit -m "feat(mcp): comment replies via parentId, tombstoning delete, threaded list"
```

---

### Task 4: PublicService — nested tree, tombstones omitted, orphans promoted

**Files:**

- Modify: `apps/api/src/public/public.service.ts` (comments select ~lines 55–58, return ~line 72)
- Test: `apps/api/src/public/public.service.spec.ts`

**Interfaces:**

- Consumes: Task 1 schema columns.
- Produces: `findPublicTask().comments` changes shape from flat `{ author, body, createdAt }[]` to `PublicCommentNode[]` where `PublicCommentNode = { id, author, body, createdAt, replies: PublicCommentNode[] }`. Tombstoned comments are excluded; non-deleted comments whose parent is excluded become roots. The `id` is added to the public payload (needed for stable React keys / collapse state in Task 7).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/public/public.service.spec.ts`, inside the existing describe (near the `includes labels and comments` test), add:

```ts
  it('returns comments as a tree and omits tombstones', async () => {
    await seedTask(prisma, board.id); // ensure existing local fixture names match the file's helpers — reuse whatever setup the neighboring test uses
    ...
  });
```

Do NOT copy that skeleton — use the file's actual fixture pattern. Concretely, mirror the neighboring test's setup (which seeds via `seedBoard`/`seedTask`/`seedComment` — check the existing `includes labels and comments` test for exact calls) and write these two tests:

```ts
it('returns comments as a threaded tree and omits tombstones', async () => {
  // setup identical to the 'includes labels and comments' test above, then:
  const parent = await seedComment(prisma, task.id, { author: 'tester', body: 'parent' });
  await seedComment(prisma, task.id, { author: 'tester', body: 'the reply', parentId: parent.id });
  await seedComment(prisma, task.id, {
    author: 'gone',
    body: 'buried',
    parentId: parent.id,
    deletedAt: new Date(),
  });

  const result = await service.findPublicTask(board.identifier, task.number);

  const roots = result.comments;
  expect(roots).toHaveLength(1);
  expect(roots[0]).toMatchObject({ author: 'tester', body: 'parent' });
  expect(roots[0].replies).toHaveLength(1);
  expect(roots[0].replies[0]).toMatchObject({ author: 'tester', body: 'the reply' });
});

it('promotes replies of deleted comments to top level', async () => {
  // same fixture pattern as the neighboring test, then:
  const parent = await seedComment(prisma, task.id, {
    author: 'gone',
    body: 'deleted root',
    deletedAt: new Date(),
  });
  await seedComment(prisma, task.id, { author: 'k', body: 'orphan', parentId: parent.id });

  const result = await service.findPublicTask(board.identifier, task.number);

  expect(result.comments).toHaveLength(1);
  expect(result.comments[0]).toMatchObject({ author: 'k', body: 'orphan' });
  expect(result.comments[0].replies).toEqual([]);
});
```

(If the spec file's helpers differ — e.g. it seeds the task as `task` via a shared `beforeEach` — use those variables; the assertions are the contract, the fixture lines adapt to the file's existing pattern.)

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=public
```

Expected: the two new tests FAIL (comments are flat and include tombstoned bodies).

- [ ] **Step 3: Implement**

In `apps/api/src/public/public.service.ts`, replace the comments select with:

```ts
        comments: {
          select: {
            id: true,
            parentId: true,
            author: true,
            body: true,
            createdAt: true,
            deletedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
```

Replace `comments: task.comments,` in the return with a tree build. Add a small private helper on the class:

```ts
  /**
   * Build the public comment tree: tombstoned comments are dropped (their
   * replies are promoted to roots so the thread stays readable) and only the
   * curated fields ride along — never reactions, author ids, or edits.
   */
  private buildPublicComments(
    rows: {
      id: string;
      parentId: string | null;
      author: string;
      body: string;
      createdAt: Date;
      deletedAt: Date | null;
    }[],
  ): {
    id: string;
    author: string;
    body: string;
    createdAt: Date;
    replies: any[];
  }[] {
    const byId = new Map<string, any>();
    for (const row of rows) {
      if (row.deletedAt) continue;
      byId.set(row.id, {
        id: row.id,
        author: row.author,
        body: row.body,
        createdAt: row.createdAt,
        replies: [] as any[],
      });
    }
    const roots: any[] = [];
    for (const row of rows) {
      if (row.deletedAt) continue;
      const node = byId.get(row.id);
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    }
    for (const node of byId.values()) {
      node.replies.sort(
        (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return roots;
  }
```

Note the ordering subtlety: `byId` is filled in fetch order (desc), so pushing nodes while iterating keeps roots newest-first; only replies get re-sorted oldest-first. In `findPublicTask`, return:

```ts
      comments: this.buildPublicComments(task.comments),
```

(The docstring at the top of the file mentions comments are in scope — still true; no comment needed on the select.)

- [ ] **Step 4: Run to verify pass**

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=public
```

Expected: PASS — the existing `includes labels and comments` test still passes (`toMatchObject` ignores the new `replies`/`id` fields).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/public
git commit -m "feat(api): public task payload returns threaded comments, omits tombstones"
```

---

### Task 5: Web types + API client + hooks for threaded comments

**Files:**

- Modify: `apps/web/src/types/index.ts` (`Comment` ~line 107, `PublicTask` ~line 230)
- Modify: `apps/web/src/hooks/api.ts` (`comments.create`, ~line 193)
- Modify: `apps/web/src/hooks/use-comments.ts` (`useCreateComment`, ~line 12)
- Test: `apps/web/src/types/index.test.ts` (~line 94)

**Interfaces:**

- Consumes: server shapes from Tasks 2 and 4.
- Produces (Task 6/7 consume):
  - `Comment.replies: Comment[]`, `Comment.parentId?: string | null`, `Comment.deletedAt?: string | null`.
  - `api.comments.create(data)` accepts `data.parentId?: string`.
  - `useCreateComment().mutate({ taskId, author, body, parentId? })`.

- [ ] **Step 1: Update the types test first (it's the contract)**

In `apps/web/src/types/index.test.ts`, replace the `should have correct Comment type` test with:

```ts
it('should have correct Comment type', () => {
  const comment: Comment = {
    id: 'c1',
    taskId: 't1',
    author: 'alice',
    body: 'Nice work!',
    replies: [],
    createdAt: '2026-01-01T00:00:00Z',
  };
  expect(comment.body).toBe('Nice work!');
  expect(comment.replies).toEqual([]);

  const parent: Comment = {
    ...comment,
    replies: [{ ...comment, id: 'c2', body: 'a reply' }],
  };
  expect(parent.replies[0].parentId).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/web && npx vitest run src/types/index.test.ts
```

Expected: FAIL (`replies` not on the type).

- [ ] **Step 3: Update `Comment` and `PublicTask` in `types/index.ts`**

```ts
export interface Comment {
  id: string;
  taskId: string;
  parentId?: string | null;
  author: string;
  authorId?: string | null;
  body: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: CommentReaction[];
  replies: Comment[];
  createdAt: string;
}
```

And in `PublicTask`, change the comments field. Add above `PublicTask`:

```ts
/** Read-only threaded comment on the public task page. No ids leak beyond the comment id. */
export interface PublicComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  replies: PublicComment[];
}
```

and change `comments:` to:

```ts
  comments: PublicComment[];
```

Read the surrounding doc comment above `PublicTask` first (lines ~220–229) and keep it accurate — update the phrase about the payload to mention comments are threaded.

- [ ] **Step 4: Thread `parentId` through the client and hook**

In `apps/web/src/hooks/api.ts`:

```ts
    create: (data: { taskId: string; author: string; body: string; parentId?: string }) =>
      request<Comment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
```

In `apps/web/src/hooks/use-comments.ts`:

```ts
export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId: string; author: string; body: string; parentId?: string }) =>
      api.comments.create(data),
    onSuccess: (_data, variables) => {
      toast.success('Comment added');
      queryClient.invalidateQueries({ queryKey: ['comments', variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
    onError: (error) => {
      toast.error('Failed to create comment', { description: error.message });
    },
  });
}
```

(Only the `mutationFn` parameter type changes; behavior identical — invalidation re-fetches the tree server-side.)

- [ ] **Step 5: Run the tests and the compiler**

```bash
cd apps/web && npx vitest run src/types/index.test.ts
cd apps/web && npx tsc --noEmit
```

Expected: types test PASS. `tsc` reports exactly the 3 pre-existing errors (kanban-board.tsx, ui/dropdown-menu.tsx, use-labels.ts) — no new ones. If `task-detail-view.tsx` now errors, Task 7 fixes it; if any _other_ file errors on `replies`, fix that file's Comment literals by adding `replies: []` at this point.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types apps/web/src/hooks/api.ts apps/web/src/hooks/use-comments.ts
git commit -m "feat(web): threaded Comment type and parentId pass-through"
```

---

### Task 6: DetailComments UI — tree rendering, collapse toggles, reply composer, tombstones

**Files:**

- Modify: `apps/web/src/components/detail-comments.tsx` (full rework of the list rendering)
- Test: `apps/web/src/components/detail-comments.test.tsx`

**Interfaces:**

- Consumes: `Comment` type from Task 5 (with `replies`, `deletedAt`).
- Produces: `DetailComments` props change — `onSubmit: (body: string, parentId?: string) => void`. All other props unchanged. `task-detail-view.tsx` (Task 7) consumes the new signature. Header count = visible (non-deleted) comments including replies.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/components/detail-comments.test.tsx`:

Update the `makeComment` helper so new Comment fields are present by default:

```ts
function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    taskId: 't1',
    author: 'Alice',
    authorId: 'user-1',
    body: 'Looks good',
    parentId: null,
    deletedAt: null,
    replies: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
```

Append a new describe block at the end of the file:

```tsx
describe('DetailComments — threaded replies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'user-1', role: 'member' };
  });

  it('renders replies nested under their parent', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [makeComment({ id: 'c2', body: 'nested body' })],
    });
    renderComments([parent]);
    expect(await screen.findByText('root body')).toBeInTheDocument();
    expect(await screen.findByText('nested body')).toBeInTheDocument();
  });

  it('shows a "N replies" toggle with aria-expanded and collapses the subtree on click', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [
        makeComment({ id: 'c2', body: 'reply one' }),
        makeComment({ id: 'c3', body: 'reply two' }),
      ],
    });
    renderComments([parent]);

    const toggle = await screen.findByText('2 replies');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('reply one')).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('reply one')).not.toBeInTheDocument();
    expect(screen.queryByText('reply two')).not.toBeInTheDocument();
  });

  it('opens the reply composer and submits with the parent id', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const onSubmit = vi.fn();
    render(<DetailComments comments={[parent]} onSubmit={onSubmit} formatTimestamp={(ts) => ts} />);

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    const textarea = screen.getByPlaceholderText('Reply to Alice…');
    fireEvent.change(textarea, { target: { value: 'my reply' } });
    fireEvent.click(screen.getByText('Reply'));
    expect(onSubmit).toHaveBeenCalledWith('my reply', 'c1');
    expect(screen.queryByPlaceholderText('Reply to Alice…')).not.toBeInTheDocument();
  });

  it('cancels the reply composer without submitting', async () => {
    const parent = makeComment({ id: 'c1', body: 'root body' });
    const onSubmit = vi.fn();
    render(<DetailComments comments={[parent]} onSubmit={onSubmit} formatTimestamp={(ts) => ts} />);

    await userEvent.click(screen.getByLabelText('Reply to Alice'));
    fireEvent.change(screen.getByPlaceholderText('Reply to Alice…'), {
      target: { value: 'draft' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Reply to Alice…')).not.toBeInTheDocument();
  });

  it('renders tombstoned comments as a muted "deleted" marker with no menu, reactions or reply', () => {
    const parent = makeComment({
      id: 'c1',
      body: '',
      deletedAt: '2026-01-02T00:00:00Z',
      authorId: 'user-1',
      replies: [makeComment({ id: 'c2', body: 'surviving reply' })],
    });
    renderComments([parent], vi.fn(), undefined, vi.fn(), vi.fn());

    expect(screen.getByText('deleted')).toBeInTheDocument();
    expect(screen.queryByLabelText('Comment actions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reply to Alice')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add reaction')).not.toBeInTheDocument();
    expect(screen.getByText('surviving reply')).toBeInTheDocument();
  });

  it('counts only visible (non-deleted) comments in the header', async () => {
    const parent = makeComment({
      id: 'c1',
      body: 'root body',
      replies: [
        makeComment({ id: 'c2', body: 'visible reply' }),
        makeComment({ id: 'c3', body: '', deletedAt: '2026-01-02T00:00:00Z' }),
      ],
    });
    renderComments([parent]);

    const heading = await screen.findByRole('heading', { name: /comments/i });
    expect(heading).toHaveTextContent('Comments (2)');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/web && npx vitest run src/components/detail-comments.test.tsx
```

Expected: new tests FAIL (no `Replies` toggle, no reply composer, tombstones still render markdown). Existing tests should still pass.

- [ ] **Step 3: Rework the component**

Replace the list-rendering portion of `apps/web/src/components/detail-comments.tsx`. Keep all imports, and add `Reply` to the lucide import:

```ts
import { MessageSquare, MoreHorizontal, Trash2, Pencil, Smile, Reply } from 'lucide-react';
```

Change the props interface and the header comment block at the top of the file to reflect threading — the new interface:

```ts
interface DetailCommentsProps {
  comments: Comment[];
  onSubmit: (body: string, parentId?: string) => void;
  onDelete?: (commentId: string) => void;
  onEdit?: (commentId: string, body: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  formatTimestamp: (ts: string) => string;
}
```

Add this helper above the component:

```ts
function countVisible(comments: Comment[] | undefined): number {
  if (!comments) return 0;
  return comments.reduce((n, c) => n + (c.deletedAt ? 0 : 1) + countVisible(c.replies), 0);
}
```

Inside the component, add state after the existing `reactPickerFor` line:

```ts
const [replyTo, setReplyTo] = useState<string | null>(null);
const [replyText, setReplyText] = useState('');
const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
```

Add derived value and handlers after the existing `submit`:

```ts
const visibleCount = useMemo(() => countVisible(comments), [comments]);

const closeReply = () => {
  setReplyTo(null);
  setReplyText('');
};

const submitReply = () => {
  if (!replyTo || !replyText.trim()) return;
  onSubmit(replyText.trim(), replyTo);
  closeReply();
};

const openReply = (commentId: string) => {
  setReplyTo((prev) => (prev === commentId ? null : commentId));
  setReplyText('');
};

const toggleCollapsed = (id: string) =>
  setCollapsedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
```

Guard the existing `canModify`/`canDelete` against tombstones (first line of each body):

```ts
const canModify = (c: Comment) => {
  if (c.deletedAt) return false;
  if (!user || !onEdit) return false;
  if (!c.authorId) return user.role === 'admin';
  return c.authorId === user.id || user.role === 'admin';
};

const canDelete = (c: Comment) => {
  if (c.deletedAt) return false;
  if (!user || !onDelete) return false;
  if (!c.authorId) return user.role === 'admin';
  return c.authorId === user.id || user.role === 'admin';
};
```

(`useMemo` must be added to the react import at the top.)

Now replace the "Comment list — flat timeline" `<div>` block with a recursive renderer. The top-level section header uses the visible count:

```tsx
<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
  <MessageSquare className="size-3.5" />
  Comments ({visibleCount})
</h3>
```

The list body becomes:

```tsx
{
  /* Comment list — threaded tree; roots newest-first, replies oldest-first (server-built) */
}
<div>
  {comments.map((c) => renderNode(c, 0))}
  {comments.length === 0 && <p className="text-sm text-muted-foreground py-3">No comments yet.</p>}
</div>;
```

Define `renderNode` inside the component (a closure — it reads the shared state/handlers directly, avoiding 15 props of plumbing):

```tsx
const renderNode = (c: Comment, depth: number) => {
  const isEditing = editingId === c.id;
  const isDeleted = !!c.deletedAt;
  const replies = c.replies ?? [];
  const collapsed = collapsedIds.has(c.id);
  const showMenu = canDelete(c) || canModify(c);

  return (
    <div
      key={c.id}
      className={depth === 0 ? 'group py-3 border-b border-border last:border-0' : 'group py-3'}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{c.author}</span>
        <span className="text-xs font-mono text-muted-foreground">
          {formatTimestamp(c.createdAt)}
        </span>
        {c.editedAt && <span className="text-xs font-mono text-muted-foreground">(edited)</span>}
        {replies.length > 0 && (
          <button
            type="button"
            onClick={() => toggleCollapsed(c.id)}
            aria-expanded={!collapsed}
            className="text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>
        )}
        {(showMenu || (!isDeleted && onSubmit)) && (
          <div className="ml-auto flex items-center gap-0.5">
            {!isDeleted && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                aria-label={`Reply to ${c.author}`}
                onClick={() => openReply(c.id)}
              >
                <Reply className="size-3.5" />
              </Button>
            )}
            {showMenu && (
              <DropdownMenu>
                {/* ⋯ menu — unchanged from the flat version */}
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    aria-label="Comment actions"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canModify(c) && (
                    <DropdownMenuItem onClick={() => startEdit(c)}>
                      <Pencil className="size-3.5" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete(c) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Bu yorumu silmek istediğine emin misin? Bu işlem geri alınamaz. Yoruma
                            yapılmış yanıtlar yerinde kalır.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete!(c.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {isDeleted ? (
        <p className="mt-1 text-xs font-mono text-muted-foreground">deleted</p>
      ) : isEditing ? (
        <div className="mt-1 flex flex-col gap-2">
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
            }}
            rows={3}
            aria-label="Edit comment"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={saveEdit} disabled={!editBody.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <MarkdownEditor value={c.body} editable={false} className="mt-1" />
      )}

      {/* Reply composer — one open at a time */}
      {replyTo === c.id && !isDeleted && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitReply();
              }
            }}
            rows={2}
            placeholder={`Reply to ${c.author}…`}
            aria-label="Reply composer"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={submitReply} disabled={!replyText.trim()}>
              Reply
            </Button>
            <Button size="sm" variant="ghost" onClick={closeReply}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Reaction row — hidden on tombstones */}
      {onReact && !isEditing && !isDeleted && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {c.reactions?.map((r) => {
            const mine = hasReacted(c, r.emoji);
            return (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(c.id, r.emoji)}
                className={
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ' +
                  (mine
                    ? 'border-primary/40 bg-muted text-muted-foreground'
                    : 'border-border bg-muted text-muted-foreground')
                }
                aria-label={`${r.emoji} reaction, ${r.userIds.length} reactors`}
              >
                <span>{r.emoji}</span>
                <span className="font-mono">{r.userIds.length}</span>
              </button>
            );
          })}
          <Popover
            open={reactPickerFor === c.id}
            onOpenChange={(open) => setReactPickerFor(open ? c.id : null)}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label="Add reaction"
              >
                <Smile className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-1">
              <div className="grid grid-cols-7 gap-0.5">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(c.id, emoji);
                      setReactPickerFor(null);
                    }}
                    className="rounded p-1 text-base hover:bg-muted"
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {!collapsed && replies.length > 0 && (
        <div className="mt-1 ml-4 border-l border-border pl-4">
          {replies.map((r) => renderNode(r, depth + 1))}
        </div>
      )}
    </div>
  );
};
```

Also update the header docblock at the top of the file — replace the first line `* DetailComments — flat timeline comments + composer.` and the "Comment rows are flat (no card chrome)" sentence with:

```
 * DetailComments — threaded comments + composer.
 *
 * Composer at top: Textarea (rows=2) + Submit (outline, NOT Lime — design.md:
 * detail page has no primary creation action). Enter submits, Shift+Enter
 * newline. Comments render as a server-built tree: roots newest-first, replies
 * nested under their parent with a Graphite left border, oldest-first. Any
 * comment with children gets a mono "N replies" expand/collapse toggle
 * (aria-expanded, expanded by default). A Reply button (hover reveal) opens one
 * inline composer at a time; submitting calls onSubmit(body, parentId) — the
 * parent mutation invalidates and re-fetches the whole tree.
 *
 * Tombstones (deletedAt set, body blanked by the server): rendered as a muted
 * mono "deleted" marker — no body, menu, reactions, or reply button. Children
 * of a tombstone keep rendering in place. Header counts visible comments only.
```

- [ ] **Step 3: Run to verify pass**

```bash
cd apps/web && npx vitest run src/components/detail-comments.test.tsx
```

Expected: PASS — new threaded tests and all pre-existing delete/edit/reaction tests. If `task-detail-page.test.tsx` mocks `use-comments` and renders DetailComments, run it too:

```bash
cd apps/web && npx vitest run src/pages/task-detail-page.test.tsx src/components/task-detail-view.test.tsx
```

(The `task-detail-view.test.tsx` mocks DetailComments entirely, so it should be unaffected.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/detail-comments.tsx apps/web/src/components/detail-comments.test.tsx
git commit -m "feat(web): threaded comment replies with collapse toggles and tombstones"
```

---

### Task 7: Wire consumers — task-detail-view and public task page

**Files:**

- Modify: `apps/web/src/components/task-detail-view.tsx` (`handleAddComment` ~line 84)
- Modify: `apps/web/src/pages/public-task-page.tsx` (comments section ~lines 125–147)

**Interfaces:**

- Consumes: `DetailComments` new `onSubmit(body, parentId?)` (Task 6), `PublicComment` type (Task 5).
- Produces: Full end-to-end behavior — replying from the detail page hits `POST /api/comments` with `parentId`; the public page renders the pruned tree.

- [ ] **Step 1: Update handleAddComment in task-detail-view.tsx**

```ts
const handleAddComment = useCallback(
  (body: string, parentId?: string) => {
    if (!task) return;
    createComment.mutate({ taskId: task.id, author: 'user', body, parentId });
  },
  [task, createComment],
);
```

- [ ] **Step 2: Rework the public page comments section**

In `apps/web/src/pages/public-task-page.tsx`, add a `useState` import to the existing react import and these two pieces above the `PublicTaskPage` component:

```tsx
/** Recursive read-only comment; mirrors DetailComments nesting minus all controls. */
function PublicCommentNode({ comment }: { comment: PublicComment }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <li>
      <div className="rounded-md border border-border p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-foreground">{comment.author}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {formatTimestamp(comment.createdAt)}
          </span>
          {comment.replies.length > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              className="ml-auto text-xs font-mono text-muted-foreground hover:text-foreground"
            >
              {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
        <MarkdownEditor value={comment.body} editable={false} className="mt-1" />
      </div>
      {!collapsed && comment.replies.length > 0 && (
        <ul className="ml-4 mt-2 space-y-2 border-l border-border pl-4">
          {comment.replies.map((r) => (
            <PublicCommentNode key={r.id} comment={r} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

Update the import of types at the top — add `PublicComment`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicTask, PublicTaskNotFoundError } from '@/hooks/public-api';
import { MarkdownEditor } from '@/components/markdown';
import { LabelPill } from '@/components/label-pill';
import { Skeleton } from '@/components/ui/skeleton';
import type { PublicComment } from '@/types';
```

Replace the comments section (the `{task.comments.length > 0 && (…)}` block) with:

```tsx
{
  task.comments.length > 0 && (
    <section className="space-y-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Comments
      </h2>
      <ul className="space-y-4">
        {task.comments.map((c) => (
          <PublicCommentNode key={c.id} comment={c} />
        ))}
      </ul>
    </section>
  );
}
```

Also update the file's top docblock: change "comments have no composer" to "comments have no composer and render the server-pruned thread tree (tombstones omitted, orphaned replies promoted — see PublicService.buildPublicComments)".

- [ ] **Step 3: Typecheck and run web tests**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: exactly the 3 pre-existing errors. Note: `useState` moved to the react import — the file previously may not have imported it at all.

```bash
pnpm --filter @taskforge/web test
```

Expected: all web tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/task-detail-view.tsx apps/web/src/pages/public-task-page.tsx
git commit -m "feat(web): reply composer wired on task detail, threaded comments on public page"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run every relevant suite**

```bash
pnpm --filter @taskforge/api test
pnpm --filter @taskforge/web test
cd apps/web && npx tsc --noEmit
pnpm format:check
```

Expected: API suite green (including comments, mcp, public specs), web suite green, tsc at exactly 3 pre-existing errors, prettier clean. If format:check finds issues, run `pnpm format` and re-run the failing suite before committing the formatting as its own commit (`git commit -m "style: prettier"`).

- [ ] **Step 2: Manual smoke test (both surfaces)**

```bash
pnpm dev
```

1. Sign in, open a task with comments, reply to a comment, reply to the reply (depth 3) — tree renders nested, collapse toggles work, tombstone appears as muted "deleted" after deleting a parent, and the reply survives.
2. Publish a task (`PUT /api/tasks/:id/publish` via the UI's share action), open `/public/:ident/:number` in a private window — thread renders read-only with collapse toggles; delete a published comment that has replies and confirm the public page promotes the reply to top level.

Fix anything found, then commit fixes.

- [ ] **Step 3: Push (per AGENTS.md, direct pushes to main are fine for solo dev)**

```bash
git push
```

CI (`ci.yml`) runs both test suites; no Docker image ships unless CI passes.
