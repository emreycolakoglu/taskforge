# Duplicate Relation + Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Linear-style "duplicate" task relations to TaskForge — a `duplicate_of` relation type plus a reserved `Duplicate` status per board, with auto-move + `doneAt` stamping on mark-as-duplicate.

**Architecture:** Extend the existing `TaskRelation` model (no new model). Add an `isDuplicate` boolean to `Status` so `doneAt` derivation can include Duplicate statuses without breaking the single-`isDone`-per-board invariant. Board creation seeds a 6th "Duplicate" status. `RelationsService.create` gains a `duplicate_of` branch that is directed, prevents circular chains, auto-moves the dup task into the board's Duplicate status, stamps `doneAt`, emits `task:moved`, and writes a `marked_duplicate` activity row. `delete` writes `unmarked_duplicate` (but does _not_ restore the prior status). Frontend gets two new sidebar groups ("Duplicate of", "Duplicates") and a banner on dup tasks.

**Tech Stack:** NestJS 11, Prisma 6, SQLite, Jest (API); React 19, Vite, Vitest (Web). CommonJS API, ESM web.

## Global Constraints

- API `strict: false` — do not add `strict: true`.
- API is CommonJS, Web is ESM — don't copy import patterns between apps.
- PrismaModule is `@Global()` — no need to import it.
- Board identifiers must be exactly 3 uppercase letters.
- Prettier is canonical — run `pnpm format` before committing.
- kebab-case filenames; no comments unless the _why_ is non-obvious.
- No emojis in code unless requested.
- Tests are integration-level (real temp SQLite via `createTestPrisma()`).
- AGENTS.md §3: match existing style; the default-statuses list is duplicated in 3 places — update all 3 inline (do not refactor to a shared constant in this task).

## Semantics (decided)

- **`duplicate_of` is directed.** Row convention: `fromTaskId` = the duplicate, `toTaskId` = the canonical (original) task. Mirrors `blocks` directionality.
- **`direction` on the DTO:** `source` (default) = URL task is the duplicate of `other`; `target` = `other` is the duplicate of the URL task. Same convention as `blocks`.
- **One canonical per dup.** A task may have at most one outgoing `duplicate_of`. Reject a second outgoing dup on the same task (400). Reject the reverse edge (B already dup of A → reject A dup of B) to prevent circular chains (400).
- **Self-dup** is rejected by the existing self-reference check (already throws `BadRequestException`).
- **Auto-move.** On `duplicate_of` create, the dup task (the `fromTaskId`) is moved into the board's `isDuplicate` status, `doneAt` is stamped `now`, `task:moved` is emitted, and a `marked_duplicate` activity is written.
- **Delete does not restore.** Deleting a `duplicate_of` relation writes an `unmarked_duplicate` activity but does _not_ move the task back or clear `doneAt` — the user moves it manually.
- **`doneAt` derivation.** `tasks.service.move` and the MCP `tasks_move` inline copy both treat `isDone || isDuplicate` as "closed" — stamping `now` on move-in, clearing to `null` on move-out.

---

## File Structure

**API — modified:**

- `apps/api/prisma/schema.prisma` — `Status.isDuplicate`; `TaskRelation.type` comment.
- `apps/api/src/boards/boards.service.ts` — `create` seeds 6th status.
- `apps/api/src/mcp/mcp.service.ts` — `boards_create` 6th status; `tasks_move` `doneAt` derivation; `handleRelations` passes `user`.
- `apps/api/test/setup.ts` — `seedBoard` 6th status; `seedRelation` type union widened.
- `apps/api/src/relations/dto/relation.dto.ts` — `@IsIn` adds `duplicate_of`.
- `apps/api/src/relations/relations.service.ts` — `create`/`list`/`delete` + interfaces + user param + Duplicate-status move + activity.
- `apps/api/src/relations/relations.controller.ts` — `@Req()` to pass user.
- `apps/api/src/tasks/tasks.service.ts` — `move` doneAt derivation.
- `apps/api/src/mcp/tool-definitions.ts` — `relations_create` enum + description.

**API — new migration:**

- `apps/api/prisma/migrations/<ts>_add_duplicate_status/migration.sql`

**API — tests modified:**

- `apps/api/src/relations/relations.service.spec.ts` — `duplicate_of` cases.
- `apps/api/src/mcp/mcp.service.spec.ts` — MCP `duplicate_of` case.
- `apps/api/src/boards/boards.service.spec.ts` — 6 statuses assertions.
- `apps/api/src/tasks/tasks.service.spec.ts` — move into/out of Duplicate status.

**Web — modified:**

- `apps/web/src/types/index.ts` — `RelationType` + `TaskRelations`.
- `apps/web/src/components/detail-relations.tsx` — `listType` union + `onAdd` mapping.
- `apps/web/src/components/detail-properties-sidebar.tsx` — new groups + banner.
- `apps/web/src/hooks/api.test.ts` — fixtures updated for new `TaskRelations` shape.

**Web — tests:**

- (none new — existing component tests mock the hook module; the sidebar isn't directly tested. Update `api.test.ts` fixtures only.)

---

## Task 1: Schema — add `isDuplicate` to Status + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Status model, ~line 101)
- Modify: `apps/api/prisma/schema.prisma` (TaskRelation comment, ~line 151)
- Create: `apps/api/prisma/migrations/<auto>_add_duplicate_status/migration.sql`

**Interfaces:**

- Produces: `Status.isDuplicate: Boolean @default(false)`; migration SQL.

- [ ] **Step 1: Add the column to the Status model**

In `apps/api/prisma/schema.prisma`, inside `model Status`, after the `isDone` line:

```prisma
  isDone    Boolean  @default(false)
  isDuplicate Boolean @default(false)
```

Update the `TaskRelation.type` comment (line ~151) to document the new type:

```prisma
  type        String   // "blocks" | "related_to" | "duplicate_of"
  fromTaskId  String   // "blocks": blocker; "related_to": lower-ordered; "duplicate_of": the duplicate
  toTaskId    String   // "blocks": blocked; "related_to": higher-ordered; "duplicate_of": the canonical original
```

- [ ] **Step 2: Generate the migration**

Run from the repo root:

```bash
pnpm --filter @taskforge/api prisma:migrate -- --name add_duplicate_status
```

Expected: a new `apps/api/prisma/migrations/<ts>_add_duplicate_status/migration.sql` containing `ALTER TABLE "Status" ADD COLUMN "isDuplicate" BOOLEAN NOT NULL DEFAULT false;` plus the migration metadata. Prisma also regenerates the client.

- [ ] **Step 3: Verify the client regenerated**

Run:

```bash
pnpm --filter @taskforge/api prisma:generate
```

Expected: exits 0; `isDuplicate` is now on the generated `Status` type.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(schema): add Status.isDuplicate + duplicate_of relation type"
```

---

## Task 2: Default "Duplicate" status on board creation (3 copies) + tests

**Files:**

- Modify: `apps/api/src/boards/boards.service.ts:93-100` (statuses.create array)
- Modify: `apps/api/src/mcp/mcp.service.ts:161-168` (boards_create statuses array)
- Modify: `apps/api/test/setup.ts:58-65` (seedBoard statuses array)
- Test: `apps/api/src/boards/boards.service.spec.ts` (lines ~90, ~100, ~160-169)

**Interfaces:**

- Produces: every new board has a 6th status `{ name: 'Duplicate', position: 5, color: '#64748b', isDuplicate: true, progress: 100 }`. `seedBoard` exposes it at `board.statuses[5]`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/boards/boards.service.spec.ts`, update the `create` test (lines 150-170) to expect 6 statuses including Duplicate:

```typescript
it('should create a board with 6 default statuses, Done.isDone=true, Duplicate.isDuplicate=true', async () => {
  const board = await service.create({
    name: 'New Board',
    slug: 'new-board',
    identifier: 'NEW',
  });
  expect(board.name).toBe('New Board');
  expect(board.slug).toBe('new-board');
  expect(board.identifier).toBe('NEW');
  expect(board.statuses).toHaveLength(6);
  const statuses = board.statuses;
  expect(statuses.map((s: any) => s.name)).toEqual([
    'Backlog',
    'To Do',
    'In Progress',
    'Review',
    'Done',
    'Duplicate',
  ]);
  expect(statuses.find((s: any) => s.name === 'Done').isDone).toBe(true);
  expect(statuses.find((s: any) => s.name === 'Duplicate').isDuplicate).toBe(true);
});
```

Also update the `findOne` test (line ~90) `expect(board.statuses).toHaveLength(5)` → `6`, and the `findFull` test (line ~100) `expect(board.statuses).toHaveLength(5)` → `6`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=boards.service
```

Expected: FAIL — `toHaveLength(6)` vs 5, and `Duplicate` not found.

- [ ] **Step 3: Update boards.service.ts create**

In `apps/api/src/boards/boards.service.ts` `create`, append a 6th entry to the `statuses.create` array (after the Done entry):

```typescript
            { name: 'Done', position: 4, color: '#22c55e', isDone: true, progress: 100 },
            { name: 'Duplicate', position: 5, color: '#64748b', isDuplicate: true, progress: 100 },
```

- [ ] **Step 4: Update mcp.service.ts boards_create**

In `apps/api/src/mcp/mcp.service.ts` `boards_create` case (lines 162-168), append:

```typescript
                { name: 'Done', position: 4, color: '#22c55e', isDone: true },
                { name: 'Duplicate', position: 5, color: '#64748b', isDuplicate: true },
```

- [ ] **Step 5: Update seedBoard**

In `apps/api/test/setup.ts` `seedBoard` (lines 58-65), append:

```typescript
          { name: 'Done', position: 4, color: '#22c55e', isDone: true },
          { name: 'Duplicate', position: 5, color: '#64748b', isDuplicate: true },
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=boards.service
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/boards/boards.service.ts apps/api/src/mcp/mcp.service.ts apps/api/test/setup.ts apps/api/src/boards/boards.service.spec.ts
git commit -m "feat(boards): seed Duplicate status on board creation"
```

---

## Task 3: Widen DTO + seedRelation to accept `duplicate_of`

**Files:**

- Modify: `apps/api/src/relations/dto/relation.dto.ts`
- Modify: `apps/api/test/setup.ts` (`seedRelation`, ~line 196)

**Interfaces:**

- Produces: `CreateRelationDto.type: 'blocks' | 'related_to' | 'duplicate_of'`. `seedRelation` accepts the same union.

- [ ] **Step 1: Update the DTO**

Replace `apps/api/src/relations/dto/relation.dto.ts` contents:

```typescript
import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateRelationDto {
  @IsString()
  otherTaskId: string;

  @IsIn(['blocks', 'related_to', 'duplicate_of'])
  type: 'blocks' | 'related_to' | 'duplicate_of';

  @IsOptional()
  @IsIn(['source', 'target'])
  direction?: 'source' | 'target';
}
```

- [ ] **Step 2: Update seedRelation**

In `apps/api/test/setup.ts`, change `seedRelation` (lines 196-207) to accept the widened type. Note: `duplicate_of` is directed and should _not_ be canonicalized — only `related_to` canonicalizes.

```typescript
export async function seedRelation(
  prisma: PrismaClient,
  fromTaskId: string,
  toTaskId: string,
  type: 'blocks' | 'related_to' | 'duplicate_of',
) {
  const [a, b] =
    type === 'related_to' && fromTaskId > toTaskId
      ? [toTaskId, fromTaskId]
      : [fromTaskId, toTaskId];
  return prisma.taskRelation.create({ data: { type, fromTaskId: a, toTaskId: b } });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/relations/dto/relation.dto.ts apps/api/test/setup.ts
git commit -m "feat(relations): accept duplicate_of in DTO and seed helper"
```

---

## Task 4: RelationsService.create — `duplicate_of` branch + auto-move + activity

**Files:**

- Modify: `apps/api/src/relations/relations.service.ts` (interfaces, `create`)
- Modify: `apps/api/src/relations/relations.controller.ts` (`@Req()`, pass user)
- Test: `apps/api/src/relations/relations.service.spec.ts`

**Interfaces:**

- Consumes: `CreateRelationDto` (Task 3), `Status.isDuplicate` (Task 1).
- Produces: `RelationsService.create(taskId, dto, user?)` — for `duplicate_of`, moves the dup task to the board's Duplicate status, stamps `doneAt`, emits `task:moved`, writes `marked_duplicate` activity. `RelationsService.delete(relationId, user?)` writes `unmarked_duplicate` when the deleted row was `duplicate_of`.

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/relations/relations.service.spec.ts` (inside the describe block, before the closing `});`). The spec setup seeds `tA/tB/tC` in `board.statuses[0]`; the Duplicate status is at `board.statuses[5]`.

```typescript
// ─── duplicate_of ─────────────────────────────────────────────────────────

it('19. create duplicate_of (source) → URL task is duplicate of other; row {from: urlTask, to: other}; URL task moved to Duplicate status + doneAt stamped; marked_duplicate activity', async () => {
  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const entry = await service.create(
    tA.id,
    { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' },
    { id: 'u1', displayName: 'emre' },
  );
  expect(entry.type).toBe('duplicate_of');
  expect(entry.task.id).toBe(tB.id);

  const row = await prisma.taskRelation.findFirst();
  expect(row!.fromTaskId).toBe(tA.id);
  expect(row!.toTaskId).toBe(tB.id);

  const moved = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(moved!.statusId).toBe(dupStatus.id);
  expect(moved!.doneAt).not.toBeNull();

  const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
  expect(activity!.action).toBe('marked_duplicate');
  expect(activity!.actor).toBe('emre');
});

it('20. create duplicate_of (target) → other is the duplicate; other task moved to Duplicate status; URL task untouched', async () => {
  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const entry = await service.create(
    tA.id,
    { otherTaskId: tB.id, type: 'duplicate_of', direction: 'target' },
    { id: 'u1', displayName: 'emre' },
  );
  expect(entry.task.id).toBe(tB.id);
  const row = await prisma.taskRelation.findFirst();
  expect(row!.fromTaskId).toBe(tB.id);
  expect(row!.toTaskId).toBe(tA.id);

  const otherTask = await prisma.task.findUnique({ where: { id: tB.id } });
  expect(otherTask!.statusId).toBe(dupStatus.id);
  expect(otherTask!.doneAt).not.toBeNull();

  const urlTask = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(urlTask!.statusId).toBe(board.statuses[0].id);
});

it('21. create duplicate_of self → BadRequestException', async () => {
  await expect(
    service.create(tA.id, { otherTaskId: tA.id, type: 'duplicate_of' }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('22. create duplicate_of when URL task already has an outgoing duplicate_of → BadRequestException (one canonical per dup)', async () => {
  await service.create(tA.id, { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' });
  await expect(
    service.create(tA.id, { otherTaskId: tC.id, type: 'duplicate_of', direction: 'source' }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('23. create duplicate_of circular (A dup of B, then B dup of A) → BadRequestException', async () => {
  await service.create(tA.id, { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' });
  await expect(
    service.create(tB.id, { otherTaskId: tA.id, type: 'duplicate_of', direction: 'source' }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('24. create duplicate_of emits task:moved for the dup task', async () => {
  const emitSpy = jest.spyOn(events, 'emit');
  await service.create(tA.id, { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' });
  const movedEvents = emitSpy.mock.calls.filter((c) => c[0] === 'task:moved');
  expect(movedEvents.length).toBe(1);
  expect(movedEvents[0][1].id).toBe(tA.id);
  emitSpy.mockRestore();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: FAIL — the new tests error (no `duplicate_of` branch / auto-move).

- [ ] **Step 3: Update the interfaces**

In `apps/api/src/relations/relations.service.ts`, widen the three type unions (lines ~14, ~21-23, ~27):

```typescript
export interface RelationEntry {
  relationId: string;
  type: 'blocks' | 'related_to' | 'duplicate_of';
  task: { id: string; taskNumber: string; title: string };
}

export interface TaskRelationsResponse {
  taskId: string;
  blocking: RelationEntry[];
  blockedBy: RelationEntry[];
  relatedTo: RelationEntry[];
  duplicateOf: RelationEntry[];
  duplicates: RelationEntry[];
}

interface RelationEventPayload {
  relationId: string;
  type: 'blocks' | 'related_to' | 'duplicate_of';
  fromTaskId: string;
  toTaskId: string;
  boardId: string;
}
```

- [ ] **Step 4: Update `create` — add the `duplicate_of` normalization branch**

In `relations.service.ts` `create`, replace the type-specific normalization block (lines ~131-154) to add a `duplicate_of` branch and thread the `user` param.

Change the method signature:

```typescript
  async create(
    taskId: string,
    dto: CreateRelationDto,
    user?: { id: string; displayName: string },
  ): Promise<RelationEntry> {
```

Replace the normalization block with:

```typescript
// 4. Type-specific normalization
let fromTaskId: string;
let toTaskId: string;
if (dto.type === 'blocks' || dto.type === 'duplicate_of') {
  const direction = dto.direction ?? 'source';
  // 'source' = URL task is the source → {from: urlTask, to: other}
  //   for blocks:    URL task blocks other
  //   for duplicate: URL task is the duplicate of other
  // 'target' = other is the source → {from: other, to: urlTask}
  if (direction === 'source') {
    fromTaskId = taskId;
    toTaskId = dto.otherTaskId;
  } else {
    fromTaskId = dto.otherTaskId;
    toTaskId = taskId;
  }
} else {
  // related_to: canonicalize so fromTaskId < toTaskId
  if (taskId < dto.otherTaskId) {
    fromTaskId = taskId;
    toTaskId = dto.otherTaskId;
  } else {
    fromTaskId = dto.otherTaskId;
    toTaskId = taskId;
  }
}
```

- [ ] **Step 5: Add duplicate-specific guards before the create**

Right after the normalization block (before the existing `if (dto.type === 'blocks')` cycle check), insert:

```typescript
// 4b. duplicate_of guards: one canonical per dup + no circular chains
if (dto.type === 'duplicate_of') {
  const dupId = fromTaskId;
  const canonId = toTaskId;
  const existingOutgoing = await this.prisma.taskRelation.findFirst({
    where: { type: 'duplicate_of', fromTaskId: dupId },
    select: { id: true },
  });
  if (existingOutgoing) {
    throw new BadRequestException('Task is already marked as a duplicate');
  }
  const reverseEdge = await this.prisma.taskRelation.findFirst({
    where: { type: 'duplicate_of', fromTaskId: canonId, toTaskId: dupId },
    select: { id: true },
  });
  if (reverseEdge) {
    throw new BadRequestException('This would create a circular duplicate chain');
  }
}
```

- [ ] **Step 6: After the create + event emit, add the auto-move + activity for `duplicate_of`**

Replace the tail of `create` (after the `try { row = ... }` block and the `events.emit('relation:created', ...)` call) with:

```typescript
const boardId = urlTask.boardId;
const payload: RelationEventPayload = {
  relationId: row.id,
  type: dto.type,
  fromTaskId,
  toTaskId,
  boardId,
};
this.events.emit('relation:created', payload, boardId);

// duplicate_of: move the dup task into the board's Duplicate status, stamp doneAt,
// emit task:moved, and log a marked_duplicate activity. Done inline (not via
// TasksService.move) to avoid a circular module dependency.
if (dto.type === 'duplicate_of') {
  const dupStatus = await this.prisma.status.findFirst({
    where: { boardId, isDuplicate: true },
  });
  if (dupStatus) {
    const now = new Date();
    const movedTask = await this.prisma.task.update({
      where: { id: fromTaskId },
      data: { statusId: dupStatus.id, doneAt: now },
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        status: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });
    this.events.emit('task:moved', movedTask, boardId);
  }
  await this.prisma.activity.create({
    data: {
      taskId: fromTaskId,
      actorId: user?.id ?? null,
      actor: user?.displayName ?? 'system',
      action: 'marked_duplicate',
      detail: JSON.stringify({ canonicalTaskId: toTaskId }),
    },
  });
}

// Return a RelationEntry for the "other" task (from the URL task's perspective)
const otherTaskNumber = other.board?.identifier
  ? `${other.board.identifier}-${other.number}`
  : String(other.number);
return {
  relationId: row.id,
  type: dto.type,
  task: { id: other.id, taskNumber: otherTaskNumber, title: other.title },
};
```

- [ ] **Step 7: Update the controller to pass the user**

Replace `apps/api/src/relations/relations.controller.ts` contents:

```typescript
import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { RelationsService } from './relations.service';
import { CreateRelationDto } from './dto/relation.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/tasks/:taskId/relations')
export class RelationsController {
  constructor(private readonly service: RelationsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.service.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body() dto: CreateRelationDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(taskId, dto, user);
  }

  @Delete(':relationId')
  remove(
    @Param('taskId') _taskId: string,
    @Param('relationId') relationId: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.delete(relationId, user);
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: PASS — tests 1-24 green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/relations/relations.service.ts apps/api/src/relations/relations.controller.ts apps/api/src/relations/relations.service.spec.ts
git commit -m "feat(relations): duplicate_of branch with auto-move + activity"
```

---

## Task 5: RelationsService.list — `duplicateOf` + `duplicates` groups

**Files:**

- Modify: `apps/api/src/relations/relations.service.ts` (`list`)
- Test: `apps/api/src/relations/relations.service.spec.ts`

**Interfaces:**

- Produces: `TaskRelationsResponse` gains `duplicateOf` (outgoing `duplicate_of` from URL task → the canonical) and `duplicates` (incoming `duplicate_of` to URL task → the dups of this task).

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/relations/relations.service.spec.ts`:

```typescript
it('25. list → groups duplicateOf (outgoing) and duplicates (incoming)', async () => {
  // tA is a duplicate of tB; tC is a duplicate of tA.
  await service.create(tA.id, { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' });
  await service.create(tC.id, { otherTaskId: tA.id, type: 'duplicate_of', direction: 'source' });

  const resA = await service.list(tA.id);
  expect(resA.duplicateOf).toHaveLength(1);
  expect(resA.duplicateOf[0].task.id).toBe(tB.id);
  expect(resA.duplicates).toHaveLength(1);
  expect(resA.duplicates[0].task.id).toBe(tC.id);

  const resB = await service.list(tB.id);
  expect(resB.duplicateOf).toEqual([]);
  expect(resB.duplicates).toHaveLength(1);
  expect(resB.duplicates[0].task.id).toBe(tA.id);
});

it('26. list with no duplicate relations → duplicateOf and duplicates are empty arrays', async () => {
  const res = await service.list(tA.id);
  expect(res.duplicateOf).toEqual([]);
  expect(res.duplicates).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: FAIL — `duplicateOf`/`duplicates` undefined.

- [ ] **Step 3: Update `list`**

In `relations.service.ts`, update the `entry` helper signature and the grouping loop in `list` (lines ~62-93). Replace the `entry` helper's `type` param and the three arrays + loop:

```typescript
const entry = (
  relId: string,
  type: 'blocks' | 'related_to' | 'duplicate_of',
  t: { id: string; number: number; title: string; board: { identifier: string } | null },
): RelationEntry => ({
  relationId: relId,
  type,
  task: {
    id: t.id,
    taskNumber: t.board?.identifier ? `${t.board.identifier}-${t.number}` : String(t.number),
    title: t.title,
  },
});

const blocking: RelationEntry[] = [];
const blockedBy: RelationEntry[] = [];
const relatedTo: RelationEntry[] = [];
const duplicateOf: RelationEntry[] = [];
const duplicates: RelationEntry[] = [];

for (const r of rows) {
  if (r.type === 'blocks') {
    if (r.fromTaskId === taskId) {
      blocking.push(entry(r.id, 'blocks', r.toTask));
    } else {
      blockedBy.push(entry(r.id, 'blocks', r.fromTask));
    }
  } else if (r.type === 'related_to') {
    const other = r.fromTaskId === taskId ? r.toTask : r.fromTask;
    relatedTo.push(entry(r.id, 'related_to', other));
  } else if (r.type === 'duplicate_of') {
    // fromTaskId = the duplicate, toTaskId = the canonical.
    if (r.fromTaskId === taskId) {
      duplicateOf.push(entry(r.id, 'duplicate_of', r.toTask));
    } else {
      duplicates.push(entry(r.id, 'duplicate_of', r.fromTask));
    }
  }
}

return { taskId, blocking, blockedBy, relatedTo, duplicateOf, duplicates };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: PASS — tests 1-26 green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/relations/relations.service.ts apps/api/src/relations/relations.service.spec.ts
git commit -m "feat(relations): list duplicateOf and duplicates groups"
```

---

## Task 6: RelationsService.delete — `unmarked_duplicate` activity + user param

**Files:**

- Modify: `apps/api/src/relations/relations.service.ts` (`delete`, `cleanupForTask`)
- Test: `apps/api/src/relations/relations.service.spec.ts`

**Interfaces:**

- Produces: `delete(relationId, user?)` writes `unmarked_duplicate` activity when the deleted row was `duplicate_of`. Does _not_ restore the prior status. `cleanupForTask` is unchanged (no activity on cascade delete).

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/relations/relations.service.spec.ts`:

```typescript
it('27. delete a duplicate_of relation → unmarked_duplicate activity written; task status NOT restored', async () => {
  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const entry = await service.create(tA.id, {
    otherTaskId: tB.id,
    type: 'duplicate_of',
    direction: 'source',
  });
  // Confirm the dup task was moved to Duplicate.
  expect((await prisma.task.findUnique({ where: { id: tA.id } }))!.statusId).toBe(dupStatus.id);

  await service.delete(entry.relationId, { id: 'u1', displayName: 'emre' });

  // Activity written.
  const activities = await prisma.activity.findMany({
    where: { taskId: tA.id, action: 'unmarked_duplicate' },
  });
  expect(activities).toHaveLength(1);
  expect(activities[0].actor).toBe('emre');

  // Status NOT restored — still in Duplicate.
  expect((await prisma.task.findUnique({ where: { id: tA.id } }))!.statusId).toBe(dupStatus.id);
});

it('28. delete a non-duplicate relation → no unmarked_duplicate activity', async () => {
  const entry = await service.create(tA.id, {
    otherTaskId: tB.id,
    type: 'blocks',
    direction: 'source',
  });
  await service.delete(entry.relationId);
  const activities = await prisma.activity.findMany({
    where: { action: 'unmarked_duplicate' },
  });
  expect(activities).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: FAIL — `unmarked_duplicate` not written.

- [ ] **Step 3: Update `delete`**

In `relations.service.ts`, change `delete` to accept a user and write the activity. Replace the `delete` method:

```typescript
  async delete(
    relationId: string,
    user?: { id: string; displayName: string },
  ): Promise<{ deleted: boolean }> {
    const row = await this.prisma.taskRelation.findUnique({
      where: { id: relationId },
      include: { fromTask: { select: { boardId: true } } },
    });
    if (!row) throw new NotFoundException('Relation not found');

    await this.prisma.taskRelation.delete({ where: { id: relationId } });

    const boardId = row.fromTask.boardId;
    this.events.emit(
      'relation:deleted',
      {
        relationId: row.id,
        type: row.type as 'blocks' | 'related_to' | 'duplicate_of',
        fromTaskId: row.fromTaskId,
        toTaskId: row.toTaskId,
        boardId,
      } satisfies RelationEventPayload,
      boardId,
    );

    // Deleting a duplicate_of relation is the only relation deletion worth
    // surfacing in activity. The task's status is deliberately NOT restored.
    if (row.type === 'duplicate_of') {
      await this.prisma.activity.create({
        data: {
          taskId: row.fromTaskId,
          actorId: user?.id ?? null,
          actor: user?.displayName ?? 'system',
          action: 'unmarked_duplicate',
          detail: JSON.stringify({ canonicalTaskId: row.toTaskId }),
        },
      });
    }

    return { deleted: true };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=relations.service
```

Expected: PASS — tests 1-28 green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/relations/relations.service.ts apps/api/src/relations/relations.service.spec.ts
git commit -m "feat(relations): log unmarked_duplicate on relation delete"
```

---

## Task 7: `tasks.service.move` + MCP `tasks_move` — derive `doneAt` from `isDuplicate`

**Files:**

- Modify: `apps/api/src/tasks/tasks.service.ts:382`
- Modify: `apps/api/src/mcp/mcp.service.ts:547`
- Test: `apps/api/src/tasks/tasks.service.spec.ts` (lines ~285-304)

**Interfaces:**

- Produces: moving a task into an `isDuplicate` status stamps `doneAt`; moving out clears it. Same semantics as `isDone`.

- [ ] **Step 1: Write failing tests**

In `apps/api/src/tasks/tasks.service.spec.ts`, extend the `move — doneAt stamping` describe block (lines 285-304) with:

```typescript
it('moving into an isDuplicate status stamps doneAt', async () => {
  const seeded = await seedTask(prisma, board.statuses[0].id);
  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const moved = await service.move(seeded.id, { statusId: dupStatus.id }, user);
  expect(moved.doneAt).not.toBeNull();
});

it('moving out of an isDuplicate status clears doneAt', async () => {
  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const seeded = await seedTask(prisma, dupStatus.id, { doneAt: new Date() });
  const moved = await service.move(seeded.id, { statusId: board.statuses[0].id }, user);
  expect(moved.doneAt).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=tasks.service
```

Expected: FAIL — `board.statuses.find(...)` returns undefined because seedBoard only has 5 statuses. (If Task 2 is already committed, this passes already — if so, skip the "fail" expectation and just confirm.)

Note: if Task 2's seedBoard change is already in, the `find` works but the `doneAt` derivation still uses `isDone` only → the "stamps doneAt" test should actually pass since `move` only checks `isDone`. Re-check: the `isDuplicate` stamping test will FAIL because `move` doesn't yet consider `isDuplicate`. Good.

- [ ] **Step 3: Update `tasks.service.ts move`**

In `apps/api/src/tasks/tasks.service.ts`, line 382:

```typescript
const isClosedTarget = targetStatus.isDone || targetStatus.isDuplicate;
const wasClosedSource = sourceStatus?.isDone || sourceStatus?.isDuplicate;
const doneAt = isClosedTarget ? now : wasClosedSource ? null : undefined;
```

- [ ] **Step 4: Update MCP `tasks_move`**

In `apps/api/src/mcp/mcp.service.ts`, line 547:

```typescript
const isClosedTarget = targetStatus.isDone || targetStatus.isDuplicate;
const wasClosedSource = sourceStatus?.isDone || sourceStatus?.isDuplicate;
const doneAt = isClosedTarget ? now : wasClosedSource ? null : undefined;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=tasks.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/tasks.service.ts apps/api/src/mcp/mcp.service.ts apps/api/src/tasks/tasks.service.spec.ts
git commit -m "feat(tasks): derive doneAt from isDuplicate on move"
```

---

## Task 8: MCP — pass user to `relations.create` + update tool definition

**Files:**

- Modify: `apps/api/src/mcp/mcp.service.ts` (`handleRelations`, ~line 708)
- Modify: `apps/api/src/mcp/tool-definitions.ts` (~line 275)
- Test: `apps/api/src/mcp/mcp.service.spec.ts`

**Interfaces:**

- Produces: `relations_create` MCP tool accepts `type: 'duplicate_of'`; the handler passes `user` so activity is attributed.

- [ ] **Step 1: Write a failing test**

In `apps/api/src/mcp/mcp.service.spec.ts`, inside the relations describe block (after the existing `relations_create` tests, before `relations_delete`), add:

```typescript
it('relations_create with type=duplicate_of → URL task moved to Duplicate status; activity attributed to user', async () => {
  const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
  const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
  const res = await service.handleRequest(
    {
      method: 'relations_create',
      params: { taskId: tA.id, otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' },
      id: 410,
    },
    user,
  );
  expect(res.result.type).toBe('duplicate_of');
  const row = await prisma.taskRelation.findFirst();
  expect(row!.fromTaskId).toBe(tA.id);
  expect(row!.toTaskId).toBe(tB.id);

  const dupStatus = board.statuses.find((s) => s.isDuplicate)!;
  const moved = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(moved!.statusId).toBe(dupStatus.id);
  expect(moved!.doneAt).not.toBeNull();

  const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
  expect(activity!.action).toBe('marked_duplicate');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service
```

Expected: FAIL — `relations_create` with `duplicate_of` likely errors (MCP handler doesn't pass `user`, so activity actor is `system` — actually the test asserts `marked_duplicate` which the service now writes; but without passing `user` the actor is `system`. The test doesn't assert actor here, so it may pass already if the service work from Task 4 is in. The key remaining change is the tool definition enum, which only affects schema validation, not the runtime handler.)

Re-check: the MCP `handleRelations` `create` case calls `this.relations.create(params.taskId, { otherTaskId, type, direction })` — it does NOT pass `user`. That means `marked_duplicate` activity is written with actor `system`. The test above doesn't check actor, so it would pass. To make the MCP path attribute correctly, we must pass `user`. Add an actor assertion to make the test fail first:

Update the test's last assertion to:

```typescript
expect(activity!.action).toBe('marked_duplicate');
expect(activity!.actor).toBe(user.displayName);
```

Now it fails because `actor` is `system` (user not passed).

- [ ] **Step 3: Update `handleRelations` to pass user**

In `apps/api/src/mcp/mcp.service.ts`, change `handleRelations` (lines ~708-724):

```typescript
  private async handleRelations(action: string, params: any, user?: AuthUser) {
    switch (action) {
      case 'list':
        return this.relations.list(params.taskId);
      case 'create':
        return this.relations.create(
          params.taskId,
          {
            otherTaskId: params.otherTaskId,
            type: params.type,
            direction: params.direction,
          },
          user ? { id: user.id, displayName: user.displayName } : undefined,
        );
      case 'delete':
        return this.relations.delete(
          params.relationId,
          user ? { id: user.id, displayName: user.displayName } : undefined,
        );
      default:
        throw new Error(`Unknown action: relations_${action}`);
    }
  }
```

- [ ] **Step 4: Update the tool definition**

In `apps/api/src/mcp/tool-definitions.ts`, update the `relations_create` entry (lines ~275-285):

```typescript
  {
    name: 'relations_create',
    title: 'Create relation',
    description:
      'Create a relation between two tasks. direction: "source" = URL task is the source; "target" = other is the source. For "blocks": source blocks other. For "duplicate_of": source is the duplicate of other (the canonical). Defaults to "source".',
    inputSchema: {
      taskId: idField('Task'),
      otherTaskId: idField('Other task'),
      type: z.enum(['blocks', 'related_to', 'duplicate_of']),
      direction: z.enum(['source', 'target']).optional(),
    },
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mcp/mcp.service.ts apps/api/src/mcp/tool-definitions.ts apps/api/src/mcp/mcp.service.spec.ts
git commit -m "feat(mcp): pass user to relations_create/delete; accept duplicate_of"
```

---

## Task 9: Run the full API test suite + format

**Files:** none

- [ ] **Step 1: Run the full API test suite**

Run:

```bash
pnpm --filter @taskforge/api test
```

Expected: all suites PASS. If any pre-existing suite breaks due to the 6th status (e.g. a test indexing `board.statuses[4]` as the last, or asserting `toHaveLength(5)`), update it to the new shape — but only the assertions broken by this change, not unrelated ones.

- [ ] **Step 2: Format**

Run:

```bash
pnpm format
```

- [ ] **Step 3: Commit any formatting**

```bash
git add -A
git commit -m "style: prettier" --allow-empty
```

(Skip the commit if nothing changed.)

---

## Task 10: Frontend types + hooks + sidebar groups + banner

**Files:**

- Modify: `apps/web/src/types/index.ts` (lines ~69, ~77-82)
- Modify: `apps/web/src/components/detail-relations.tsx` (lines ~23, ~65-75)
- Modify: `apps/web/src/components/detail-properties-sidebar.tsx` (after line ~144, plus banner)
- Modify: `apps/web/src/hooks/api.test.ts` (fixtures at ~665)

**Interfaces:**

- Produces: `RelationType` includes `'duplicate_of'`; `TaskRelations` has `duplicateOf` and `duplicates`. The sidebar renders two new groups ("Duplicate of", "Duplicates") and a banner on tasks that are duplicates.

- [ ] **Step 1: Update the types**

In `apps/web/src/types/index.ts` (lines 69-82):

```typescript
export type RelationType = 'blocks' | 'related_to' | 'duplicate_of';

export interface RelationEntry {
  relationId: string;
  type: RelationType;
  task: { id: string; taskNumber: string; title: string };
}

export interface TaskRelations {
  taskId: string;
  blocking: RelationEntry[];
  blockedBy: RelationEntry[];
  relatedTo: RelationEntry[];
  duplicateOf: RelationEntry[];
  duplicates: RelationEntry[];
}
```

- [ ] **Step 2: Update `detail-relations.tsx`**

In `apps/web/src/components/detail-relations.tsx`, widen `listType` (line 23) and the `onAdd` mapping (lines 65-75):

```typescript
listType: 'related_to' |
  'blocks-source' |
  'blocks-target' |
  'duplicate-source' |
  'duplicate-target';
```

```typescript
          onAdd={(id) => {
            if (listType === 'related_to') {
              onAdd(id, 'related_to');
            } else if (listType === 'duplicate-source') {
              onAdd(id, 'duplicate_of', 'source');
            } else if (listType === 'duplicate-target') {
              onAdd(id, 'duplicate_of', 'target');
            } else if (listType === 'blocks-source') {
              onAdd(id, 'blocks', 'source');
            } else {
              onAdd(id, 'blocks', 'target');
            }
          }}
```

- [ ] **Step 3: Add the new sidebar groups + banner**

In `apps/web/src/components/detail-properties-sidebar.tsx`, after the "Related" group (after line ~144), add two new groups. Place the "Duplicate of" group _before_ "Duplicates" so the dup's canonical is visible first:

```tsx
{
  /* Group 6 — Duplicate of */
}
<DetailGroup>
  <DetailGroupTitle>Duplicate of</DetailGroupTitle>
  <DetailRelations
    relations={relations?.duplicateOf}
    taskId={task.id}
    boardId={task.boardId}
    boardTasks={boardTasks}
    onAdd={onAddRelation}
    onRemove={onRemoveRelation}
    onNavigate={onNavigate}
    listType="duplicate-source"
  />
</DetailGroup>;

{
  /* Group 7 — Duplicates */
}
<DetailGroup>
  <DetailGroupTitle>Duplicates</DetailGroupTitle>
  <DetailRelations
    relations={relations?.duplicates}
    taskId={task.id}
    boardId={task.boardId}
    boardTasks={boardTasks}
    onAdd={onAddRelation}
    onRemove={onRemoveRelation}
    onNavigate={onNavigate}
    listType="duplicate-target"
  />
</DetailGroup>;
```

Add a banner at the top of the sidebar (or near the task header) when `relations?.duplicateOf` is non-empty. Find where the sidebar's top section is rendered and insert before the existing groups:

```tsx
{
  relations?.duplicateOf && relations.duplicateOf.length > 0 && (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-secondary)]">
      This is a duplicate of{' '}
      {relations.duplicateOf.map((r, i) => (
        <span key={r.relationId}>
          {i > 0 && ', '}
          <button
            className="font-mono text-[var(--primary)] hover:underline"
            onClick={() => onNavigate(r.task.id)}
          >
            {r.task.taskNumber}
          </button>
        </span>
      ))}
    </div>
  );
}
```

(Confirm the exact CSS variable names used elsewhere in this file before writing — match the existing pattern. If the file uses different tokens, use those.)

- [ ] **Step 4: Update `api.test.ts` fixtures**

In `apps/web/src/hooks/api.test.ts`, the relations list fixture (line ~666) must include the new fields:

```typescript
const rels = {
  taskId: 't1',
  blocking: [],
  blockedBy: [],
  relatedTo: [],
  duplicateOf: [],
  duplicates: [],
};
```

- [ ] **Step 5: Typecheck the web app**

Run:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: the pre-existing 3 errors only (kanban-board.tsx, ui/dropdown-menu.tsx, use-labels.ts) — the count must not grow.

- [ ] **Step 6: Run the web tests**

Run:

```bash
pnpm --filter @taskforge/web test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): duplicate relation groups + banner on task detail"
```

---

## Task 11: Final verification + mark task done

**Files:** none

- [ ] **Step 1: Full API test run**

```bash
pnpm --filter @taskforge/api test
```

Expected: PASS.

- [ ] **Step 2: Full web test run**

```bash
pnpm --filter @taskforge/web test
```

Expected: PASS.

- [ ] **Step 3: Format check**

```bash
pnpm format:check
```

Expected: PASS (no unformatted files).

- [ ] **Step 4: Move TFG-31 to In Progress (if not already) then Done**

Use the taskforge MCP tools: move TFG-31 to the board's "Done" status once all acceptance criteria are met and tests are green.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: TFG-31 verification complete" --allow-empty
```

---

## Self-Review Checklist (run after writing)

- [x] **Spec coverage:**
  - `TaskRelation.type` accepts `duplicate_of` + migration → Task 1 (isDuplicate col), Task 3 (DTO), Task 4 (service). ✓
  - Board creation auto-creates Duplicate status with `isDuplicate: true` → Task 2. ✓
  - `POST /api/tasks/:taskId/relations` with `duplicate_of` auto-moves to Duplicate status + stamps `doneAt` → Task 4. ✓
  - Cannot mark task as duplicate of itself → Task 4 (existing self-ref check, test 21). ✓
  - Cannot create circular chains → Task 4 (guards + test 23). ✓
  - Task detail "Mark as duplicate" action + canonical "Duplicates" subsection + dup banner → Task 10 (sidebar groups + banner). ✓
  - MCP `relations_create` accepts `duplicate_of` with documented direction → Task 8. ✓
  - Deleting a duplicate relation does NOT restore prior status → Task 6 (test 27). ✓
  - Activity `marked_duplicate` / `unmarked_duplicate` → Tasks 4 & 6. ✓
  - Unit tests for merge flow, circular prevention, auto-status-move → Task 4 (tests 19-24). ✓
  - Frontend test for "mark as duplicate" UI flow → Task 10 updates `api.test.ts` fixtures; the sidebar itself is not directly tested (matches existing coverage pattern). The spec's "Frontend test for the mark as duplicate UI flow" is partially satisfied — the hook-level fixtures are updated; a dedicated component test is out of scope for this minimal pass. Note this gap.
- [x] **Placeholder scan:** no TBD/TODO in steps.
- [x] **Type consistency:** `duplicate_of` used consistently across DTO, service, types, tool definition. `duplicateOf`/`duplicates` used consistently in API response and frontend `TaskRelations`.

## Known gap vs. spec

The spec's "Frontend test for the 'mark as duplicate' UI flow" is not fully delivered — there is no dedicated component test for the new sidebar groups/banner. The existing test suite doesn't test `DetailPropertiesSidebar` directly (component tests mock the hook modules but the sidebar isn't covered). Adding a new component test is a separate, larger effort that doesn't block the feature. The API-level test coverage (the load-bearing part) is complete.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-28-duplicate-relation-merge.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
