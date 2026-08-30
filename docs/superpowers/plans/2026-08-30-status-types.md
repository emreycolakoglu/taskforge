# Status Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `isDone`/`isDuplicate` booleans on `Status` with a `type` enum column (`triage | backlog | todo | in_progress | done | cancelled | duplicate`), add type-derived progress rules with per-type editability, auto-unblock blockers when a task enters a `done` column, restructure the board settings page into a tabbed layout with a full CRUD statuses subpage, and consolidate the 3 drifted seed sites into one shared constant.

**Architecture:** Single Prisma migration adds `type`, drops `isDone`/`isDuplicate`, makes `progress` nullable. Service layer enforces progress-by-type rules (locked for backlog/todo/done/cancelled/duplicate; editable for triage/in_progress). `doneAt` stamping moves from the `toggleDone` transaction into `TasksService.move` keyed on type (`done`/`cancelled` stamp, `duplicate` does not). Auto-unblock: moving into `done` type deletes outgoing `blocks` relations and logs `unblocked` activity on the freed tasks. The flat board settings page becomes a tabbed layout with child routes; statuses get full CRUD at `/board/:id/settings/statuses`.

**Tech Stack:** NestJS 11 + Prisma 6 (SQLite), React 19 + Vitest — monorepo `apps/api` (CommonJS, `strict: false`) and `apps/web` (ESM, `strict: true`).

**Spec:** `docs/superpowers/specs/2026-08-30-status-types-design.md`

## Global Constraints

- Design system: read `design.md` before any `apps/web/` change. No Acid Lime on settings UI (use borders/subtle bg for active tabs). Inter weights ≤ 590, JetBrains Mono for counts/timestamps/type badges, no gradients, Graphite borders for cards.
- API is CommonJS, Web is ESM — don't copy import patterns between apps.
- Do not add `strict: true` to `apps/api/tsconfig.json`.
- Prettier is canonical: run `pnpm format:check` before committing (or `pnpm format`). `.prettierignore` already covers generated dirs.
- No ESLint config exists; `pnpm lint` fails — never run it.
- Web build does NOT typecheck: run `cd apps/web && npx tsc --noEmit` explicitly. Baseline is 1 pre-existing error in `kanban-board.tsx` (a `DraggingStyle` vs `CSSProperties` Radix CSS var incompatibility); confirm the count doesn't grow.
- API tests are integration-level against a real temp SQLite DB; each test file cleans tables in `afterEach` in reverse dependency order — keep that order intact.
- Kebab-case filenames. Always write unit tests.
- MCP service reimplements logic inline (does NOT inject `StatusesService`) — keep the REST and MCP paths in sync.
- `StatusesService` is exported from `StatusesModule` and could be injected, but the MCP module currently mirrors inline — follow the existing pattern.

---

### Task 1: Prisma schema — add `type`, drop `isDone`/`isDuplicate`, make `progress` nullable

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Status model, lines 95-110)

**Interfaces:**

- Produces: `Status.type: string` (default `"todo"`), `Status.progress: number | null` (was `number`). `Status.isDone` and `Status.isDuplicate` no longer exist. All later tasks consume these.

- [ ] **Step 1: Update the Status model in the schema**

Edit `apps/api/prisma/schema.prisma`, replacing the `Status` model (lines 95-110) with:

```prisma
model Status {
  id        String   @id @default(cuid())
  boardId   String
  name      String
  type      String   @default("todo") // triage | backlog | todo | in_progress | done | cancelled | duplicate
  position  Float
  color     String?  @default("#6366f1")
  wipLimit  Int?
  progress  Int?     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks Task[]
}
```

Changes: add `type` column, remove `isDone` and `isDuplicate`, change `progress` from `Int @default(0)` to `Int? @default(0)`.

- [ ] **Step 2: Create the migration**

Run:

```bash
pnpm --filter @taskforge/api prisma:migrate -- --name add-status-type-drop-booleans
```

This generates a migration SQL file. Open it and verify it follows the "RedefineTables" pattern (Prisma's SQLite approach): creates `new_Status` with the `type` column and nullable `progress`, copies data from old `Status` (the `isDone`/`isDuplicate` columns won't be in the new table so they're dropped), drops old, renames.

**Before running the migration**, edit the generated SQL to add the backfill between the `INSERT INTO "new_Status"` and `DROP TABLE "Status"` lines. The `INSERT` statement needs to include `type` — set it from the old booleans:

```sql
-- After the INSERT INTO "new_Status" line, add:
UPDATE "new_Status" SET "type" = 'done' WHERE "id" IN (SELECT "id" FROM "Status" WHERE "isDone" = 1);
UPDATE "new_Status" SET "type" = 'duplicate' WHERE "id" IN (SELECT "id" FROM "Status" WHERE "isDuplicate" = 1);
```

Wait — the `INSERT INTO "new_Status"` runs before `DROP TABLE "Status"`, so the old table still exists. But the `new_Status` table doesn't have `isDone`/`isDuplicate` columns. We need to backfill from the OLD table before dropping it. Revise the migration SQL to:

1. Create `new_Status` with `type TEXT NOT NULL DEFAULT 'todo'` and `progress INTEGER` (nullable).
2. `INSERT INTO "new_Status"` with all columns from old `Status`, setting `type` via a CASE expression:

```sql
INSERT INTO "new_Status" ("id", "boardId", "name", "type", "position", "color", "wipLimit", "progress", "createdAt", "updatedAt")
SELECT "id", "boardId", "name",
  CASE WHEN "isDone" = 1 THEN 'done' WHEN "isDuplicate" = 1 THEN 'duplicate' ELSE 'todo' END,
  "position", "color", "wipLimit", "progress", "createdAt", "updatedAt"
FROM "Status";
```

3. `DROP TABLE "Status"; ALTER TABLE "new_Status" RENAME TO "Status";`

Edit the generated migration SQL to use the CASE expression in the INSERT (replace the Prisma-generated INSERT line). Keep the `PRAGMA defer_foreign_keys=ON` / `PRAGMA foreign_keys=OFF` / `PRAGMA foreign_keys=ON` wrapper.

- [ ] **Step 3: Generate the Prisma client and run the migration**

```bash
pnpm --filter @taskforge/api prisma:generate
```

Verify no errors. The generated client now has `type` on the `Status` model and `progress` is `number | null`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: add status type column, drop isDone/isDuplicate booleans

Migration backfills type from booleans: isDone→done, isDuplicate→duplicate,
else todo. progress becomes nullable (cancelled/duplicate types use null)."
```

---

### Task 2: Shared default statuses constant + seed consolidation

**Files:**

- Create: `apps/api/src/statuses/status-defaults.ts`
- Modify: `apps/api/src/boards/boards.service.ts` (create method, lines 93-101)
- Modify: `apps/api/test/setup.ts` (seedBoard function, lines 58-66)
- Test: `apps/api/src/statuses/status-defaults.ts` (inline type test)

**Interfaces:**

- Produces: `DEFAULT_STATUSES` array of `{ name, type, color, progress }`. Consumed by `BoardsService.create`, `McpService.handleBoards.create` (Task 7), and `seedBoard` (test setup).

- [ ] **Step 1: Create the shared constant**

Create `apps/api/src/statuses/status-defaults.ts`:

```typescript
export interface DefaultStatus {
  name: string;
  type: string;
  position: number;
  color: string;
  progress: number | null;
}

export const DEFAULT_STATUSES: DefaultStatus[] = [
  { name: 'Backlog', type: 'backlog', position: 0, color: '#94a3b8', progress: 0 },
  { name: 'Todo', type: 'todo', position: 1, color: '#6366f1', progress: 0 },
  { name: 'In Progress', type: 'in_progress', position: 2, color: '#f59e0b', progress: 50 },
  { name: 'Done', type: 'done', position: 3, color: '#22c55e', progress: 100 },
  { name: 'Cancelled', type: 'cancelled', position: 4, color: '#64748b', progress: null },
  { name: 'Duplicate', type: 'duplicate', position: 5, color: '#64748b', progress: null },
];
```

- [ ] **Step 2: Update BoardsService.create to use the constant**

In `apps/api/src/boards/boards.service.ts`, add the import at the top:

```typescript
import { DEFAULT_STATUSES } from '../statuses/status-defaults';
```

Replace the inline statuses seed (lines 93-101, the `statuses: { create: [...] }` block) with:

```typescript
        statuses: {
          create: DEFAULT_STATUSES,
        },
```

- [ ] **Step 3: Update seedBoard in test setup**

In `apps/api/test/setup.ts`, add the import:

```typescript
import { DEFAULT_STATUSES } from '../src/statuses/status-defaults';
```

Replace the inline statuses seed (lines 58-66) with:

```typescript
      statuses: {
        create: DEFAULT_STATUSES,
      },
```

- [ ] **Step 4: Run the boards service test to verify seed works**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=boards.service`
Expected: The test at line 151 (`should create a board with 6 default statuses...`) will FAIL because it still asserts `isDone`/`isDuplicate` and the old status names. That's expected — we'll fix the test in Task 9. Verify the seed itself works (6 statuses created) by checking the failure is about assertions, not a crash.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/statuses/status-defaults.ts apps/api/src/boards/boards.service.ts apps/api/test/setup.ts
git commit -m "refactor: consolidate default statuses into shared constant

DEFAULT_STATUSES used by BoardsService.create and seedBoard. New seed:
Backlog, Todo, In Progress, Done, Cancelled, Duplicate (Review dropped,
Cancelled added). Type and progress set per spec."
```

---

### Task 3: Status type constants and helpers (API side)

**Files:**

- Create: `apps/api/src/statuses/status-types.ts`

**Interfaces:**

- Produces: `STATUS_TYPES` array, `StatusType` type, `PROGRESS_BY_TYPE` map, `isProgressEditable(type)`, `isTerminalType(type)`, `stampsDoneAt(type)`, `defaultProgressForType(type)`. Consumed by `StatusesService` (Task 4), `TasksService.move` (Task 5), `RelationsService` (Task 6), and `McpService` (Task 7).

- [ ] **Step 1: Create the status types module**

Create `apps/api/src/statuses/status-types.ts`:

```typescript
export const STATUS_TYPES = [
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
  'duplicate',
] as const;

export type StatusType = (typeof STATUS_TYPES)[number];

const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};

export function isProgressEditable(type: string): boolean {
  return type === 'triage' || type === 'in_progress';
}

export function isTerminalType(type: string): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: string): boolean {
  return type === 'done' || type === 'cancelled';
}

export function defaultProgressForType(type: string): number | null {
  return PROGRESS_BY_TYPE[type as StatusType] ?? 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/statuses/status-types.ts
git commit -m "feat: add status type constants and helpers

STATUS_TYPES enum, progress-by-type defaults, editability and terminal-type
predicates. Shared by StatusesService, TasksService, RelationsService, McpService."
```

---

### Task 4: Update DTOs and StatusesService

**Files:**

- Modify: `apps/api/src/statuses/dto/status.dto.ts` (full rewrite of DTOs)
- Modify: `apps/api/src/statuses/statuses.service.ts` (update create/update, remove toggleDone/unsetDone)
- Modify: `apps/api/src/statuses/statuses.controller.ts` (remove toggle-done and unset-done routes)
- Test: `apps/api/src/statuses/statuses.service.spec.ts` (update tests)

**Interfaces:**

- Consumes: `STATUS_TYPES`, `isProgressEditable`, `defaultProgressForType` from `status-types.ts` (Task 3).
- Produces: `CreateStatusDto` with `type` field, `UpdateStatusDto` with `type` and `progress` (validated against type). `StatusesService.create` sets progress from type. `StatusesService.update` recomputes progress on type change, rejects progress for locked types. `toggleDone`/`unsetDone` methods removed.

- [ ] **Step 1: Rewrite the DTOs**

Replace the entire contents of `apps/api/src/statuses/dto/status.dto.ts` with:

```typescript
import { IsString, IsOptional, IsNumber, IsInt, Min, Max, IsArray, IsIn } from 'class-validator';
import { STATUS_TYPES } from '../status-types';

export class CreateStatusDto {
  @IsString()
  boardId: string;

  @IsString()
  name: string;

  @IsIn(STATUS_TYPES)
  type: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(STATUS_TYPES)
  type?: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;
}

export class ReorderStatusesDto {
  @IsArray()
  items: { id: string; position: number }[];
}
```

Changes: `CreateStatusDto` has `type` (required, validated against `STATUS_TYPES`), removed `wipLimit` and `progress`. `UpdateStatusDto` has `type` (optional), removed `wipLimit`, kept `progress` (validated, but service also enforces per-type editability).

- [ ] **Step 2: Update StatusesService — create, update, remove toggleDone/unsetDone**

In `apps/api/src/statuses/statuses.service.ts`, add imports at the top:

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { defaultProgressForType, isProgressEditable } from './status-types';
```

Replace the `create` method (lines 27-44) with:

```typescript
  async create(dto: CreateStatusDto, _user?: { id: string; displayName: string }) {
    const maxPos = await this.prisma.status.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const status = await this.prisma.status.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        type: dto.type,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        color: dto.color,
        progress: defaultProgressForType(dto.type),
      },
    });
    this.events.emit('status:created', status, dto.boardId);
    return status;
  }
```

Replace the `update` method (lines 46-51) with:

```typescript
  async update(id: string, dto: UpdateStatusDto, _user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);

    if (dto.progress !== undefined && !isProgressEditable(existing.type)) {
      throw new BadRequestException(
        `Progress is not editable for status type "${existing.type}"`,
      );
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.color !== undefined) data.color = dto.color;

    if (dto.type !== undefined) {
      data.type = dto.type;
      if (!isProgressEditable(dto.type)) {
        data.progress = defaultProgressForType(dto.type);
      } else if (dto.progress !== undefined) {
        data.progress = dto.progress;
      }
    } else if (dto.progress !== undefined && isProgressEditable(existing.type)) {
      data.progress = dto.progress;
    }

    const status = await this.prisma.status.update({ where: { id }, data });
    this.events.emit('status:updated', status, status.boardId);
    return status;
  }
```

Remove the `toggleDone` method (lines 72-87) and the `unsetDone` method (lines 89-99). Delete them entirely.

- [ ] **Step 3: Remove toggle-done and unset-done routes from the controller**

In `apps/api/src/statuses/statuses.controller.ts`, remove the `toggleDone` method (lines 48-52) and the `unsetDone` method (lines 54-58). The file should end after the `remove` method.

- [ ] **Step 4: Write the failing tests for the new create/update behavior**

Add these tests to `apps/api/src/statuses/statuses.service.spec.ts`. First, update the existing `create` tests to include `type`:

In the `describe('create')` block, update the first test (line 72-77):

```typescript
it('should create a status at the end', async () => {
  const status = await service.create({ boardId: board.id, name: 'New Status', type: 'todo' });
  expect(status.name).toBe('New Status');
  expect(status.position).toBe(6);
  expect(status.type).toBe('todo');
  expect(status.progress).toBe(0);
});
```

Update the position test (line 79-82) to include `type`:

```typescript
it('should create a status at a specific position', async () => {
  const status = await service.create({
    boardId: board.id,
    name: 'Middle',
    type: 'todo',
    position: 2.5,
  });
  expect(status.position).toBe(2.5);
});
```

Update the color test (line 84-93) — remove `wipLimit`, add `type`:

```typescript
it('should create a status with color', async () => {
  const status = await service.create({
    boardId: board.id,
    name: 'Blocked',
    type: 'todo',
    color: '#ef4444',
  });
  expect(status.color).toBe('#ef4444');
});
```

Add new tests after the existing create tests:

```typescript
it('should set progress from type default on create', async () => {
  const inProgress = await service.create({ boardId: board.id, name: 'WIP', type: 'in_progress' });
  expect(inProgress.progress).toBe(50);

  const done = await service.create({ boardId: board.id, name: 'Shipped', type: 'done' });
  expect(done.progress).toBe(100);

  const cancelled = await service.create({
    boardId: board.id,
    name: 'Abandoned',
    type: 'cancelled',
  });
  expect(cancelled.progress).toBeNull();
});

it('should reject create without type', async () => {
  await expect(service.create({ boardId: board.id, name: 'No Type' } as any)).rejects.toThrow();
});
```

In the `describe('update')` block, add tests after the existing one:

```typescript
it('should update status type and recompute progress to locked value', async () => {
  const status = await service.update(board.statuses[0].id, { type: 'done' });
  expect(status.type).toBe('done');
  expect(status.progress).toBe(100);
});

it('should update status type to cancelled and set progress to null', async () => {
  const status = await service.update(board.statuses[0].id, { type: 'cancelled' });
  expect(status.type).toBe('cancelled');
  expect(status.progress).toBeNull();
});

it('should allow progress update for in_progress type', async () => {
  const inProgress = await service.create({ boardId: board.id, name: 'WIP', type: 'in_progress' });
  const updated = await service.update(inProgress.id, { progress: 75 });
  expect(updated.progress).toBe(75);
});

it('should reject progress update for done type', async () => {
  await expect(service.update(board.statuses[3].id, { progress: 50 })).rejects.toThrow(
    BadRequestException,
  );
});

it('should reject progress update for backlog type', async () => {
  await expect(service.update(board.statuses[0].id, { progress: 50 })).rejects.toThrow(
    BadRequestException,
  );
});
```

Note: `board.statuses[3]` is the `Done` status (position 3 in the new seed). `board.statuses[0]` is `Backlog` (type `backlog`). Import `BadRequestException` at the top of the spec file:

```typescript
import { BadRequestException } from '@nestjs/common';
```

- [ ] **Step 5: Update the findByBoard test — replace isDone assertion with type**

In `apps/api/src/statuses/statuses.service.spec.ts`, update the `findByBoard` test (lines 44-51):

```typescript
  describe('findByBoard', () => {
    it('should return statuses ordered by position', async () => {
      const statuses = await service.findByBoard(board.id);
      expect(statuses).toHaveLength(6);
      expect(statuses[0].name).toBe('Backlog');
      expect(statuses[0].type).toBe('backlog');
      expect(statuses[3].name).toBe('Done');
      expect(statuses[3].type).toBe('done');
      expect(statuses[4].name).toBe('Cancelled');
      expect(statuses[4].type).toBe('cancelled');
      expect(statuses[5].name).toBe('Duplicate');
      expect(statuses[5].type).toBe('duplicate');
    });
```

- [ ] **Step 6: Remove toggleDone and unsetDone test blocks**

Delete the entire `describe('toggleDone')` block (lines 125-149) and the entire `describe('unsetDone')` block (lines 151-167).

- [ ] **Step 7: Run the tests and verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=statuses.service`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/statuses/
git commit -m "feat: update StatusesService for type-based statuses

CreateStatusDto requires type; progress auto-set from type default.
UpdateStatusDto accepts type and progress (rejected for locked types).
Remove toggleDone/unsetDone methods and controller routes."
```

---

### Task 5: Update TasksService.move — type-based doneAt + auto-unblock on done

**Files:**

- Modify: `apps/api/src/tasks/tasks.service.ts` (move method, lines 384-435)
- Test: `apps/api/src/tasks/tasks.service.spec.ts` (move — doneAt stamping block, lines 361-394)

**Interfaces:**

- Consumes: `isTerminalType`, `stampsDoneAt` from `status-types.ts` (Task 3).
- Produces: `TasksService.move` stamps `doneAt` when entering `done`/`cancelled` types, clears when leaving terminal types. Entering `done` type auto-resolves outgoing `blocks` relations and writes `unblocked` activity on freed tasks.

- [ ] **Step 1: Write the failing tests for type-based doneAt stamping**

In `apps/api/src/tasks/tasks.service.spec.ts`, replace the entire `describe('move — doneAt stamping')` block (lines 361-394) with:

```typescript
describe('move — doneAt stamping', () => {
  it('moving into a done type status stamps doneAt', async () => {
    const seeded = await seedTask(prisma, board.statuses[0].id);
    const moved = await service.move(seeded.id, { statusId: board.statuses[3].id }, user);
    expect(moved.doneAt).not.toBeNull();
  });

  it('moving out of a done type status clears doneAt', async () => {
    const doneStatus = board.statuses[3]; // type: done
    const seeded = await seedTask(prisma, doneStatus.id, { doneAt: new Date() });
    const moved = await service.move(seeded.id, { statusId: board.statuses[0].id }, user);
    expect(moved.doneAt).toBeNull();
  });

  it('moving between non-done statuses leaves doneAt null', async () => {
    const seeded = await seedTask(prisma, board.statuses[0].id);
    const moved = await service.move(seeded.id, { statusId: board.statuses[1].id }, user);
    expect(moved.doneAt).toBeNull();
  });

  it('moving into a cancelled type status stamps doneAt', async () => {
    const seeded = await seedTask(prisma, board.statuses[0].id);
    const cancelledStatus = board.statuses[4]; // type: cancelled
    const moved = await service.move(seeded.id, { statusId: cancelledStatus.id }, user);
    expect(moved.doneAt).not.toBeNull();
  });

  it('moving into a duplicate type status does NOT stamp doneAt', async () => {
    const seeded = await seedTask(prisma, board.statuses[0].id);
    const dupStatus = board.statuses[5]; // type: duplicate
    const moved = await service.move(seeded.id, { statusId: dupStatus.id }, user);
    expect(moved.doneAt).toBeNull();
  });

  it('moving out of a duplicate type status does NOT clear doneAt (it was never set)', async () => {
    const dupStatus = board.statuses[5]; // type: duplicate
    const seeded = await seedTask(prisma, dupStatus.id);
    const moved = await service.move(seeded.id, { statusId: board.statuses[0].id }, user);
    expect(moved.doneAt).toBeNull();
  });

  it('moving from done to duplicate clears doneAt (duplicate does not stamp)', async () => {
    const doneStatus = board.statuses[3]; // type: done
    const dupStatus = board.statuses[5]; // type: duplicate
    const seeded = await seedTask(prisma, doneStatus.id, { doneAt: new Date() });
    const moved = await service.move(seeded.id, { statusId: dupStatus.id }, user);
    expect(moved.doneAt).toBeNull();
  });
});

describe('move — auto-unblock on done', () => {
  it('moving into a done type status auto-resolves outgoing blocks relations', async () => {
    const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'Blocker' });
    const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'Blocked' });
    await prisma.taskRelation.create({
      data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
    });

    const doneStatus = board.statuses[3]; // type: done
    await service.move(taskA.id, { statusId: doneStatus.id }, user);

    const relations = await prisma.taskRelation.findMany({
      where: { fromTaskId: taskA.id, type: 'blocks' },
    });
    expect(relations).toHaveLength(0);
  });

  it('writes unblocked activity on the freed task', async () => {
    const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'Blocker' });
    const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'Blocked' });
    await prisma.taskRelation.create({
      data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
    });

    const doneStatus = board.statuses[3];
    await service.move(taskA.id, { statusId: doneStatus.id }, user);

    const activity = await prisma.activity.findFirst({
      where: { taskId: taskB.id, action: 'unblocked' },
    });
    expect(activity).not.toBeNull();
    expect(activity!.actor).toBe(user.displayName);
  });

  it('moving into a cancelled type status does NOT unblock', async () => {
    const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'Blocker' });
    const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'Blocked' });
    await prisma.taskRelation.create({
      data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
    });

    const cancelledStatus = board.statuses[4]; // type: cancelled
    await service.move(taskA.id, { statusId: cancelledStatus.id }, user);

    const relations = await prisma.taskRelation.findMany({
      where: { fromTaskId: taskA.id, type: 'blocks' },
    });
    expect(relations).toHaveLength(1);
  });

  it('moving into a duplicate type status does NOT unblock', async () => {
    const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'Blocker' });
    const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'Blocked' });
    await prisma.taskRelation.create({
      data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
    });

    const dupStatus = board.statuses[5]; // type: duplicate
    await service.move(taskA.id, { statusId: dupStatus.id }, user);

    const relations = await prisma.taskRelation.findMany({
      where: { fromTaskId: taskA.id, type: 'blocks' },
    });
    expect(relations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=tasks.service`
Expected: FAIL — the `move` method still uses `isDone || isDuplicate`, and `board.statuses` now has different indices/types.

- [ ] **Step 3: Update TasksService.move with type-based logic and auto-unblock**

In `apps/api/src/tasks/tasks.service.ts`, add the import at the top:

```typescript
import { isTerminalType, stampsDoneAt } from '../statuses/status-types';
```

Replace the `move` method (lines 384-435) with:

```typescript
  async move(id: string, dto: MoveTaskDto, user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);
    const maxPos = await this.prisma.task.aggregate({
      where: { statusId: dto.statusId },
      _max: { position: true },
    });

    const targetStatus = await this.prisma.status.findUniqueOrThrow({
      where: { id: dto.statusId },
    });
    const sourceStatus = await this.prisma.status.findUnique({ where: { id: existing.statusId } });
    const now = new Date();
    const isClosedTarget = isTerminalType(targetStatus.type);
    const wasClosedSource = sourceStatus ? isTerminalType(sourceStatus.type) : false;
    const targetStampsDoneAt = stampsDoneAt(targetStatus.type);
    // doneAt logic:
    // - Target stamps doneAt (done/cancelled) → set doneAt = now
    // - Target is terminal but doesn't stamp (duplicate) → clear doneAt if it was set (moving from done/cancelled to duplicate)
    // - Target is non-terminal and source was closed → clear doneAt
    // - Otherwise → leave doneAt unchanged
    const doneAt = targetStampsDoneAt
      ? now
      : isClosedTarget
        ? null
        : wasClosedSource
          ? null
          : undefined;

    const data: any = {
      statusId: dto.statusId,
      position: dto.position ?? (maxPos._max.position ?? -1) + 1,
    };
    if (doneAt !== undefined) data.doneAt = doneAt;

    const task = await this.prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        status: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });

    // Auto-unblock: moving into a done-type status resolves outgoing blocks relations.
    if (targetStatus.type === 'done') {
      const blockingRelations = await this.prisma.taskRelation.findMany({
        where: { fromTaskId: id, type: 'blocks' },
      });
      if (blockingRelations.length > 0) {
        await this.prisma.taskRelation.deleteMany({
          where: { fromTaskId: id, type: 'blocks' },
        });
        for (const rel of blockingRelations) {
          this.events.emit(
            'relation:deleted',
            {
              relationId: rel.id,
              type: 'blocks' as const,
              fromTaskId: rel.fromTaskId,
              toTaskId: rel.toTaskId,
              boardId: task.status.boardId,
            },
            task.status.boardId,
          );
          await this.prisma.activity.create({
            data: {
              taskId: rel.toTaskId,
              actorId: user?.id ?? null,
              actor: user?.displayName ?? 'system',
              action: 'unblocked',
              detail: JSON.stringify({ blockerTaskId: id, blockerCompleted: true }),
            },
          });
        }
      }
    }

    const newStatus = await this.prisma.status.findUnique({ where: { id: dto.statusId } });
    const activity = await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'moved',
        detail: JSON.stringify({
          from: existing.statusId,
          to: dto.statusId,
          statusName: newStatus?.name,
        }),
      },
    });
    await this.notifications.dispatchFromActivity(activity);

    this.events.emit('task:moved', task, task.status.boardId);
    return withTaskNumber(task);
  }
```

Key changes:

- `isClosedTarget` uses `isTerminalType(targetStatus.type)` instead of `isDone || isDuplicate`.
- `doneAt` is only set when `stampsDoneAt(targetStatus.type)` is true (done/cancelled). For `duplicate`, `doneAt` stays `undefined` (no change).
- After the task update, if the target type is `done`, find and delete all outgoing `blocks` relations, emit `relation:deleted` per row, and write `unblocked` activity on each freed task.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=tasks.service`
Expected: All tests PASS, including the new auto-unblock tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks/tasks.service.ts apps/api/src/tasks/tasks.service.spec.ts
git commit -m "feat: type-based doneAt stamping and auto-unblock on done

TasksService.move now uses status type instead of isDone/isDuplicate
booleans. done/cancelled types stamp doneAt; duplicate does not. Moving
into a done-type column auto-resolves outgoing blocks relations and
writes unblocked activity on the freed tasks."
```

---

### Task 6: Update RelationsService — duplicate_of auto-move to first duplicate-type status

**Files:**

- Modify: `apps/api/src/relations/relations.service.ts` (duplicate_of section, lines 221-251)
- Test: `apps/api/src/relations/relations.service.spec.ts` (duplicate_of tests, lines 261-300)

**Interfaces:**

- Consumes: none new (uses `prisma.status.findFirst` with `type: 'duplicate'`).
- Produces: `duplicate_of` relation creation moves the task to the first `duplicate`-type status by position (instead of `isDuplicate: true`). No `doneAt` stamping (duplicate type doesn't stamp).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/relations/relations.service.spec.ts`, update test 19 (lines 263-284). The key change: `isDuplicate` → `type: 'duplicate'` lookup, and `doneAt` should now be NULL (not set for duplicate type):

```typescript
it('19. create duplicate_of (source) → URL task is duplicate of other; row {from: urlTask, to: other}; URL task moved to Duplicate status; marked_duplicate activity; doneAt NOT stamped', async () => {
  const dupStatus = board.statuses.find((s: any) => s.type === 'duplicate')!;
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
  expect(moved!.doneAt).toBeNull();

  const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
  expect(activity!.action).toBe('marked_duplicate');
  expect(activity!.actor).toBe('emre');
});
```

Update test 20 (lines 286-304) similarly:

```typescript
it('20. create duplicate_of (target) → other is the duplicate; other task moved to Duplicate status; URL task untouched; doneAt NOT stamped', async () => {
  const dupStatus = board.statuses.find((s: any) => s.type === 'duplicate')!;
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
  expect(otherTask!.doneAt).toBeNull();

  const urlTask = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(urlTask!.statusId).toBe(board.statuses[0].id);
});
```

Update test 27 (line 358-372) — the `isDuplicate` lookup becomes `type: 'duplicate'`:

```typescript
  it('27. delete a duplicate_of relation → unmarked_duplicate activity written; task status NOT restored', async () => {
    const dupStatus = board.statuses.find((s: any) => s.type === 'duplicate')!;
```

Update test 24 (line 326-333) — it uses `isDuplicate` indirectly via the move; no change needed to the test itself since it just checks `task:moved` is emitted.

Add a new test for the "no duplicate-type status" edge case after test 20:

```typescript
it('20b. create duplicate_of when no duplicate-type status exists → task stays put, no error, marked_duplicate activity still written', async () => {
  // Delete all duplicate-type statuses from the board
  const dupStatuses = board.statuses.filter((s: any) => s.type === 'duplicate');
  for (const ds of dupStatuses) {
    await prisma.status.delete({ where: { id: ds.id } });
  }
  const originalStatusId = tA.statusId;
  const entry = await service.create(
    tA.id,
    { otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' },
    { id: 'u1', displayName: 'emre' },
  );
  expect(entry.type).toBe('duplicate_of');

  const moved = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(moved!.statusId).toBe(originalStatusId);

  const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
  expect(activity!.action).toBe('marked_duplicate');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=relations.service`
Expected: FAIL — `s.isDuplicate` is now undefined (field removed from schema), so `board.statuses.find((s) => s.isDuplicate)` returns undefined and `!` throws. Also, the `doneAt` assertion will fail because the current `RelationsService` still stamps `doneAt`.

- [ ] **Step 3: Update RelationsService — duplicate_of section**

In `apps/api/src/relations/relations.service.ts`, update the `duplicate_of` block (lines 221-251). Replace the `dupStatus` lookup and the `doneAt` stamping:

Change line 225-226 from:

```typescript
const dupStatus = await this.prisma.status.findFirst({
  where: { boardId, isDuplicate: true },
});
```

to:

```typescript
const dupStatus = await this.prisma.status.findFirst({
  where: { boardId, type: 'duplicate' },
  orderBy: { position: 'asc' },
});
```

Change line 232 — remove `doneAt: now` from the task update. The `data` should be:

```typescript
          data: { statusId: dupStatus.id },
```

Remove the `const now = new Date();` line (line 229) since it's no longer used (unless it's used elsewhere in the block — check: it was only for `doneAt`).

The full updated block (lines 224-251) becomes:

```typescript
if (dto.type === 'duplicate_of') {
  const dupStatus = await this.prisma.status.findFirst({
    where: { boardId, type: 'duplicate' },
    orderBy: { position: 'asc' },
  });
  if (dupStatus) {
    const movedTask = await this.prisma.task.update({
      where: { id: fromTaskId },
      data: { statusId: dupStatus.id },
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=relations.service`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/relations/relations.service.ts apps/api/src/relations/relations.service.spec.ts
git commit -m "feat: duplicate_of moves to first duplicate-type status, no doneAt

RelationsService duplicate_of creation now finds the first duplicate-type
status by position (instead of isDuplicate boolean). doneAt is no longer
stamped (duplicate type does not stamp doneAt per the type model)."
```

---

### Task 7: Update MCP service — handleStatuses, handleBoards seed, handleTasks move

**Files:**

- Modify: `apps/api/src/mcp/mcp.service.ts` (handleStatuses, handleBoards create, handleTasks move)
- Modify: `apps/api/src/mcp/tool-definitions.ts` (statuses tools)
- Test: `apps/api/src/mcp/mcp.service.spec.ts` (statuses tests, tasks_move tests, relations duplicate_of test)

**Interfaces:**

- Consumes: `DEFAULT_STATUSES` from `status-defaults.ts` (Task 2), `isTerminalType`, `stampsDoneAt` from `status-types.ts` (Task 3).
- Produces: MCP `statuses_create`/`update` accept `type`. MCP `toggle_done`/`unset_done` removed. MCP `tasks_move` uses type-based doneAt + auto-unblock. MCP `boards.create` uses `DEFAULT_STATUSES`.

- [ ] **Step 1: Update tool definitions**

In `apps/api/src/mcp/tool-definitions.ts`, replace the statuses_create tool (lines 73-85):

```typescript
  {
    name: 'statuses_create',
    title: 'Create status',
    description: 'Create a status in a board. position defaults to end of board.',
    inputSchema: {
      boardId: idField('Board'),
      name: z.string(),
      type: z
        .enum(['triage', 'backlog', 'todo', 'in_progress', 'done', 'cancelled', 'duplicate'])
        .describe('Status type — determines progress defaults and terminal behavior'),
      position: z.number().optional(),
      color: z.string().optional(),
    },
  },
```

Replace the statuses_update tool (lines 86-97):

```typescript
  {
    name: 'statuses_update',
    title: 'Update status',
    description: 'Update a status name, type, color, or progress.',
    inputSchema: {
      id: idField('Status'),
      name: z.string().optional(),
      type: z
        .enum(['triage', 'backlog', 'todo', 'in_progress', 'done', 'cancelled', 'duplicate'])
        .optional(),
      color: z.string().optional(),
      position: z.number().optional(),
      progress: z.number().int().min(0).max(100).optional().describe('Progress percentage (0-100). Only editable for triage and in_progress types.'),
    },
  },
```

Remove the `statuses_toggle_done` tool (lines 104-110) and the `statuses_unset_done` tool (lines 111-117) entirely.

- [ ] **Step 2: Update McpService — handleStatuses**

In `apps/api/src/mcp/mcp.service.ts`, add imports at the top:

```typescript
import { DEFAULT_STATUSES } from '../statuses/status-defaults';
import {
  isTerminalType,
  stampsDoneAt,
  isProgressEditable,
  defaultProgressForType,
} from '../statuses/status-types';
import { BadRequestException } from '@nestjs/common';
```

Update the `handleStatuses` method. Replace the `create` case (lines 222-238):

```typescript
      case 'create': {
        const maxPos = await this.prisma.status.aggregate({
          where: { boardId: params.boardId },
          _max: { position: true },
        });
        const status = await this.prisma.status.create({
          data: {
            boardId: params.boardId,
            name: params.name,
            type: params.type,
            position: params.position ?? (maxPos._max.position ?? -1) + 1,
            color: params.color,
            progress: defaultProgressForType(params.type),
          },
        });
        this.events.emit('status:created', status, params.boardId);
        return status;
      }
```

Replace the `update` case (lines 240-251):

```typescript
      case 'update': {
        const existing = await this.prisma.status.findUniqueOrThrow({ where: { id: params.id } });

        if (params.progress !== undefined && !isProgressEditable(existing.type)) {
          throw new BadRequestException(
            `Progress is not editable for status type "${existing.type}"`,
          );
        }

        const data: Record<string, any> = {};
        if (params.name !== undefined) data.name = params.name;
        if (params.color !== undefined) data.color = params.color;
        if (params.position !== undefined) data.position = params.position;

        if (params.type !== undefined) {
          data.type = params.type;
          if (!isProgressEditable(params.type)) {
            data.progress = defaultProgressForType(params.type);
          } else if (params.progress !== undefined) {
            data.progress = params.progress;
          }
        } else if (params.progress !== undefined && isProgressEditable(existing.type)) {
          data.progress = params.progress;
        }

        const status = await this.prisma.status.update({
          where: { id: params.id },
          data,
        });
        this.events.emit('status:updated', status, status.boardId);
        return status;
      }
```

Remove the `toggle_done` case and `unset_done` case entirely (lines 259 through the end of those cases — find the closing brackets for each case block).

- [ ] **Step 3: Update McpService — handleBoards create seed**

Replace the inline statuses seed in `handleBoards` create (lines 166-173) with:

```typescript
            statuses: {
              create: DEFAULT_STATUSES,
            },
```

- [ ] **Step 4: Update McpService — handleTasks move**

Replace the `move` case (lines 542-585) with:

```typescript
      case 'move': {
        const existing = await this.prisma.task.findUniqueOrThrow({ where: { id: params.id } });
        const maxPos = await this.prisma.task.aggregate({
          where: { statusId: params.statusId },
          _max: { position: true },
        });
        const targetStatus = await this.prisma.status.findUniqueOrThrow({
          where: { id: params.statusId },
        });
        const sourceStatus = await this.prisma.status.findUnique({
          where: { id: existing.statusId },
        });
        const now = new Date();
        const isClosedTarget = isTerminalType(targetStatus.type);
        const wasClosedSource = sourceStatus ? isTerminalType(sourceStatus.type) : false;
        const targetStampsDoneAt = stampsDoneAt(targetStatus.type);
        const doneAt = targetStampsDoneAt
          ? now
          : isClosedTarget
            ? null
            : wasClosedSource
              ? null
              : undefined;

        const data: any = {
          statusId: params.statusId,
          position: params.position ?? (maxPos._max.position ?? -1) + 1,
        };
        if (doneAt !== undefined) data.doneAt = doneAt;

        const task = await this.prisma.task.update({
          where: { id: params.id },
          data,
          include: {
            status: { include: { board: true } },
            board: { select: { identifier: true } },
          },
        });

        if (targetStatus.type === 'done') {
          const blockingRelations = await this.prisma.taskRelation.findMany({
            where: { fromTaskId: params.id, type: 'blocks' },
          });
          if (blockingRelations.length > 0) {
            await this.prisma.taskRelation.deleteMany({
              where: { fromTaskId: params.id, type: 'blocks' },
            });
            for (const rel of blockingRelations) {
              this.events.emit(
                'relation:deleted',
                {
                  relationId: rel.id,
                  type: 'blocks' as const,
                  fromTaskId: rel.fromTaskId,
                  toTaskId: rel.toTaskId,
                  boardId: task.status?.boardId,
                },
                task.status?.boardId,
              );
              await this.prisma.activity.create({
                data: {
                  taskId: rel.toTaskId,
                  actorId,
                  actor,
                  action: 'unblocked',
                  detail: JSON.stringify({ blockerTaskId: params.id, blockerCompleted: true }),
                },
              });
            }
          }
        }

        const newStatus = await this.prisma.status.findUnique({ where: { id: params.statusId } });
        await this.prisma.activity.create({
          data: {
            taskId: params.id,
            actorId,
            actor,
            action: 'moved',
            detail: JSON.stringify({ to: newStatus?.name }),
          },
        });
        this.events.emit('task:moved', task, task.status?.boardId);
        return withTaskNumber(task);
      }
```

- [ ] **Step 5: Update MCP tests — statuses**

In `apps/api/src/mcp/mcp.service.spec.ts`, update the `statuses_create` test (lines 188-200) to include `type`:

```typescript
describe('statuses_create', () => {
  it('should create a status', async () => {
    const res = await service.handleRequest(
      {
        method: 'statuses_create',
        params: { boardId: board.id, name: 'MCP Status', type: 'todo' },
        id: 6,
      },
      user,
    );
    expect(res.result.name).toBe('MCP Status');
    expect(res.result.type).toBe('todo');
  });
});
```

Remove the `statuses_toggle_done` describe block (lines 231-245) and the `statuses_unset_done` describe block (lines 247-281) entirely.

- [ ] **Step 6: Update MCP tests — tasks_move**

In `apps/api/src/mcp/mcp.service.spec.ts`, the `tasks_move` tests (lines 464-503) reference `board.statuses[4]` for Done. With the new seed, Done is at index 3. Update the tests:

```typescript
describe('tasks_move', () => {
  it('should move a task to another status', async () => {
    const task = await seedTask(prisma, board.statuses[0].id);
    const res = await service.handleRequest(
      {
        method: 'tasks_move',
        params: { id: task.id, statusId: board.statuses[2].id },
        id: 19,
      },
      user,
    );
    expect(res.result.statusId).toBe(board.statuses[2].id);
  });

  it('should stamp doneAt when moving to a Done status', async () => {
    const task = await seedTask(prisma, board.statuses[0].id);
    const res = await service.handleRequest(
      {
        method: 'tasks_move',
        params: { id: task.id, statusId: board.statuses[3].id },
        id: 701,
      },
      user,
    );
    expect(res.result.doneAt).not.toBeNull();
  });

  it('should clear doneAt when moving out of a Done status', async () => {
    const task = await seedTask(prisma, board.statuses[3].id, { doneAt: new Date() });
    const res = await service.handleRequest(
      {
        method: 'tasks_move',
        params: { id: task.id, statusId: board.statuses[0].id },
        id: 702,
      },
      user,
    );
    expect(res.result.doneAt).toBeNull();
  });

  it('should not stamp doneAt when moving to a Duplicate status', async () => {
    const task = await seedTask(prisma, board.statuses[0].id);
    const res = await service.handleRequest(
      {
        method: 'tasks_move',
        params: { id: task.id, statusId: board.statuses[5].id },
        id: 703,
      },
      user,
    );
    expect(res.result.doneAt).toBeNull();
  });

  it('should auto-unblock when moving to a Done status', async () => {
    const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
    const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
    await prisma.taskRelation.create({
      data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
    });
    await service.handleRequest(
      {
        method: 'tasks_move',
        params: { id: taskA.id, statusId: board.statuses[3].id },
        id: 704,
      },
      user,
    );
    const relations = await prisma.taskRelation.findMany({
      where: { fromTaskId: taskA.id, type: 'blocks' },
    });
    expect(relations).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Update MCP test — relations duplicate_of**

In `apps/api/src/mcp/mcp.service.spec.ts`, update the duplicate_of test (line 1035-1059). Change the `isDuplicate` lookup to `type` and assert `doneAt` is NULL:

```typescript
it('relations_create with type=duplicate_of → URL task moved to Duplicate status; activity attributed to user; doneAt NOT stamped', async () => {
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

  const dupStatus = board.statuses.find((s: any) => s.type === 'duplicate')!;
  const moved = await prisma.task.findUnique({ where: { id: tA.id } });
  expect(moved!.statusId).toBe(dupStatus.id);
  expect(moved!.doneAt).toBeNull();

  const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
  expect(activity!.action).toBe('marked_duplicate');
  expect(activity!.actor).toBe(user.displayName);
});
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=mcp.service`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/mcp/
git commit -m "feat: update MCP service for status types

statuses_create/update accept type; toggle_done/unset_done tools removed.
tasks_move uses type-based doneAt + auto-unblock on done. boards.create
seeds DEFAULT_STATUSES. duplicate_of no longer stamps doneAt."
```

---

### Task 8: Update boards service test — seed assertions

**Files:**

- Modify: `apps/api/src/boards/boards.service.spec.ts` (seed test, lines 151-172)

**Interfaces:**

- Produces: board creation test asserts new seed names and `type` values instead of `isDone`/`isDuplicate`.

- [ ] **Step 1: Update the seed assertion test**

In `apps/api/src/boards/boards.service.spec.ts`, replace the test at lines 151-172:

```typescript
it('should create a board with 6 default statuses with correct types', async () => {
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
    'Todo',
    'In Progress',
    'Done',
    'Cancelled',
    'Duplicate',
  ]);
  expect(statuses.find((s: any) => s.name === 'Done').type).toBe('done');
  expect(statuses.find((s: any) => s.name === 'Cancelled').type).toBe('cancelled');
  expect(statuses.find((s: any) => s.name === 'Duplicate').type).toBe('duplicate');
  expect(statuses.find((s: any) => s.name === 'Backlog').type).toBe('backlog');
  expect(statuses.find((s: any) => s.name === 'Todo').type).toBe('todo');
  expect(statuses.find((s: any) => s.name === 'In Progress').type).toBe('in_progress');
});
```

- [ ] **Step 2: Run the boards service test**

Run: `pnpm --filter @taskforge/api test -- --testPathPatterns=boards.service`
Expected: All tests PASS.

- [ ] **Step 3: Run the full API test suite**

Run: `pnpm --filter @taskforge/api test`
Expected: All tests PASS. If any test fails due to `isDone`/`isDuplicate` references we missed, fix them (search for `isDone` and `isDuplicate` across the test suite).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/boards/boards.service.spec.ts
git commit -m "test: update board seed assertions for status types

Asserts type values (done, cancelled, duplicate, etc.) instead of
isDone/isDuplicate booleans. Seed names match new DEFAULT_STATUSES."
```

---

### Task 9: Web types and API client updates

**Files:**

- Modify: `apps/web/src/types/index.ts` (Status interface, lines 16-27)
- Modify: `apps/web/src/hooks/api.ts` (api.statuses, lines 128-146)
- Create: `apps/web/src/lib/status-type.ts`
- Modify: `apps/web/src/types/index.test.ts` (no Status fixture currently, but type changes may require updates)
- Modify: `apps/web/src/lib/kanban-dnd.test.ts` (synthetic Status objects need `type`)

**Interfaces:**

- Produces: `StatusType` type and `Status.type` field on the web. `api.statuses.create` accepts `type`, `api.statuses.update` accepts `type` and `progress`. `toggleDone`/`unsetDone` removed from API client. Web-side type helpers in `status-type.ts`.

- [ ] **Step 1: Update the web Status type**

In `apps/web/src/types/index.ts`, replace the `Status` interface (lines 16-27) with:

```typescript
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

Changes: add `type`, remove `isDone` and `wipLimit`, `progress` becomes `number | null`.

- [ ] **Step 2: Create the web status-type helpers**

Create `apps/web/src/lib/status-type.ts`:

```typescript
import type { StatusType } from '@/types';

const PROGRESS_BY_TYPE: Record<StatusType, number | null> = {
  triage: 0,
  backlog: 0,
  todo: 0,
  in_progress: 50,
  done: 100,
  cancelled: null,
  duplicate: null,
};

export function defaultProgressForType(type: StatusType): number | null {
  return PROGRESS_BY_TYPE[type] ?? 0;
}

export function isProgressEditable(type: StatusType): boolean {
  return type === 'triage' || type === 'in_progress';
}

export function isTerminalType(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled' || type === 'duplicate';
}

export function stampsDoneAt(type: StatusType): boolean {
  return type === 'done' || type === 'cancelled';
}
```

- [ ] **Step 3: Update the API client**

In `apps/web/src/hooks/api.ts`, replace the `api.statuses` block (lines 128-146) with:

```typescript
  // Statuses
  statuses: {
    list: (boardId: string) => request<Status[]>(`/statuses/board/${boardId}`),
    create: (data: {
      boardId: string;
      name: string;
      type: StatusType;
      position?: number;
      color?: string;
    }) => request<Status>('/statuses', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<Pick<Status, 'name' | 'type' | 'color' | 'position' | 'progress'>>,
    ) => request<Status>(`/statuses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    reorder: (items: { id: string; position: number }[]) =>
      request<Status[]>('/statuses/reorder', { method: 'PUT', body: JSON.stringify({ items }) }),
    delete: (id: string) => request<void>(`/statuses/${id}`, { method: 'DELETE' }),
  },
```

Changes: `create` accepts `type` (required), removed `wipLimit`. `update` typed to specific fields. Removed `toggleDone` and `unsetDone`. Fixed the `reorder` method (it had a syntax bug: `method: { method: ... }` → `method: 'PUT'`).

Make sure `StatusType` is imported in `api.ts`. Add to the existing import from `@/types`:

```typescript
import type { ..., StatusType } from '@/types';
```

Check the current import line and add `StatusType` to it.

- [ ] **Step 4: Update kanban-dnd test synthetic Status objects**

In `apps/web/src/lib/kanban-dnd.test.ts`, the `columns()` function (lines 21-38) creates `Status` objects without `type`. Add `type: 'todo'` to each:

```typescript
function columns(): Status[] {
  return [
    {
      id: 'todo',
      boardId: 'b1',
      name: 'Todo',
      type: 'todo',
      position: 0,
      tasks: [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'todo', 2)],
    },
    {
      id: 'doing',
      boardId: 'b1',
      name: 'Doing',
      type: 'in_progress',
      position: 1,
      tasks: [task('x', 'doing', 0), task('y', 'doing', 1)],
    },
  ];
}
```

- [ ] **Step 5: Update task-detail-page test mock board statuses**

In `apps/web/src/pages/task-detail-page.test.tsx`, the mock board statuses (lines 63-71) need `type`:

```typescript
  statuses: [
    {
      id: 'status-1',
      boardId: 'board-1',
      name: 'Backlog',
      type: 'backlog',
      position: 0,
      tasks: [mockTask],
    },
  ],
```

- [ ] **Step 6: Run the web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: May have 1 pre-existing error in `kanban-board.tsx`. Confirm no NEW errors from the type changes. Fix any new errors (likely in `board-settings-page.tsx` which still references `status.isDone` and `api.statuses.toggleDone`/`unsetDone` — those will be fixed in Task 11, but the typecheck may flag them now).

If `board-settings-page.tsx` causes typecheck errors, that's expected — it will be rewritten in Task 11. Note the errors but don't fix them yet.

- [ ] **Step 7: Run web tests**

Run: `pnpm --filter @taskforge/web test`
Expected: Tests that reference `isDone` or `toggleDone`/`unsetDone` will fail. Those are in `board-settings-page.tsx` (tested in Task 11). Other tests should pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/lib/status-type.ts apps/web/src/hooks/api.ts apps/web/src/lib/kanban-dnd.test.ts apps/web/src/pages/task-detail-page.test.tsx
git commit -m "feat: update web types and API client for status types

Status type gains type field, loses isDone/wipLimit. API client create
accepts type, update accepts type+progress. toggleDone/unsetDone removed.
Web-side status-type helpers added."
```

---

### Task 10: Update ProgressIcon for null progress (cancelled/duplicate)

**Files:**

- Modify: `apps/web/src/components/progress-icon.tsx` (full file, 62 lines)

**Interfaces:**

- Consumes: `StatusType` from `@/types` (optional, for rendering null-progress icons).
- Produces: `ProgressIcon` accepts `progress: number | null` and optional `type?: StatusType`. Renders a distinct icon for null progress (cancelled = gray filled circle with slash, duplicate = gray filled circle with copy indicator).

- [ ] **Step 1: Update ProgressIcon to handle null progress**

Replace the full contents of `apps/web/src/components/progress-icon.tsx` with:

```typescript
/**
 * ProgressIcon — circular progress indicator as an inline SVG.
 *
 * Renders a ring with a filled arc proportional to `progress` (0-100).
 * Color changes by threshold: 0-30 red, 31-70 amber, 71-100 green.
 *
 * For null progress (cancelled/duplicate types), renders a filled gray circle
 * with a distinct glyph: a slash for cancelled, a copy mark for duplicate.
 *
 * Props:
 *   progress  — 0-100 percentage, or null for terminal non-progress types
 *   type      — optional status type for null-progress icon selection
 *   size      — viewBox size in px (default 16)
 *   className — optional Tailwind classes
 */
import type { FC } from 'react';
import type { StatusType } from '@/types';

interface ProgressIconProps {
  progress: number | null;
  type?: StatusType;
  size?: number;
  className?: string;
}

function progressColor(p: number): string {
  if (p <= 30) return '#EF4444'; // red
  if (p <= 70) return '#F59E0B'; // amber
  return '#22C55E'; // green
}

const GRAY = '#64748B';

export const ProgressIcon: FC<ProgressIconProps> = ({ progress, type, size = 16, className }) => {
  if (progress === null || progress === undefined) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill={GRAY} opacity={0.3} />
        {type === 'cancelled' ? (
          <line
            x1="4"
            y1="4"
            x2="12"
            y2="12"
            stroke={GRAY}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ) : (
          <circle cx="8" cy="8" r="2.5" fill="none" stroke={GRAY} strokeWidth="1.5" />
        )}
      </svg>
    );
  }

  const p = Math.max(0, Math.min(100, progress));
  const r = 6;
  const strokeWidth = 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - p / 100);
  const color = progressColor(p);

  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity={0.15}
      />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 8 8)"
        style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
      />
    </svg>
  );
};
```

- [ ] **Step 2: Update BoardColumn to pass type to ProgressIcon**

In `apps/web/src/components/board-column.tsx`, update line 61 to pass `type`:

```typescript
        <ProgressIcon progress={status.progress ?? 0} type={status.type} size={16} />
```

- [ ] **Step 3: Update DetailStatusSelect to pass type to ProgressIcon**

In `apps/web/src/components/detail-status-select.tsx`, update line 45:

```typescript
            <ProgressIcon progress={s.progress ?? 0} type={s.type} size={16} />
```

- [ ] **Step 4: Run the web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Same baseline errors (board-settings-page.tsx will still error until Task 11). No new errors from ProgressIcon changes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/progress-icon.tsx apps/web/src/components/board-column.tsx apps/web/src/components/detail-status-select.tsx
git commit -m "feat: ProgressIcon renders distinct icons for null progress

Cancelled type shows a gray circle with slash; duplicate shows a gray
circle with inner ring. BoardColumn and DetailStatusSelect pass type
to ProgressIcon."
```

---

### Task 11: Restructure board settings into tabbed layout with child routes

**Files:**

- Modify: `apps/web/src/app.tsx` (routing, lines 60-67)
- Modify: `apps/web/src/pages/board-settings-page.tsx` (split into layout + section files)
- Create: `apps/web/src/pages/board-settings/general-section.tsx`
- Create: `apps/web/src/pages/board-settings/labels-section.tsx`
- Create: `apps/web/src/pages/board-settings/members-section.tsx`
- Create: `apps/web/src/pages/board-settings/danger-section.tsx`
- Create: `apps/web/src/pages/board-settings/statuses-section.tsx`
- Test: `apps/web/src/pages/board-settings-page.test.tsx`

**Interfaces:**

- Consumes: `Status`, `StatusType` from `@/types`, `api.statuses` from `hooks/api.ts`, `isProgressEditable` from `lib/status-type.ts`.
- Produces: Tabbed board settings at `/board/:id/settings/*` with child routes. `StatusesSection` with full CRUD (add, edit, reorder, delete).

This is the largest task. Break it into sub-steps carefully.

- [ ] **Step 1: Create the board-settings directory and extract sections**

Create `apps/web/src/pages/board-settings/` directory.

Extract `BoardInfoSection` from `board-settings-page.tsx` (lines 100-167) into `apps/web/src/pages/board-settings/general-section.tsx`. Export it as `GeneralSection`. Keep all the same imports and logic — just move the component to its own file and export it.

Extract `LabelsSection` (lines 278-304), `LabelRow` (lines 306-384), `LabelEditForm` (lines 386-431), `AddLabelForm` (lines 433-495) into `apps/web/src/pages/board-settings/labels-section.tsx`. Export `LabelsSection`.

Extract `MembersSection` (lines 497-656) into `apps/web/src/pages/board-settings/members-section.tsx`. Export `MembersSection`.

Extract `DeleteBoardSection` (lines 658-713) into `apps/web/src/pages/board-settings/danger-section.tsx`. Export `DeleteBoardSection`.

Each extracted file should include its own imports (copy the relevant imports from the top of `board-settings-page.tsx`). The components currently take props like `boardId`, `boardName`, `statuses`, `labels`, `members` — keep those prop signatures.

- [ ] **Step 2: Create the StatusesSection with full CRUD**

Create `apps/web/src/pages/board-settings/statuses-section.tsx`:

```typescript
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { api } from '@/hooks/api';
import type { Status, StatusType } from '@/types';
import { isProgressEditable } from '@/lib/status-type';
import { ProgressIcon } from '@/components/progress-icon';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as UILabel } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPE_OPTIONS: { value: StatusType; label: string }[] = [
  { value: 'triage', label: 'Triage' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'duplicate', label: 'Duplicate' },
];

export function StatusesSection({ boardId, statuses }: { boardId: string; statuses: Status[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<StatusType>('todo');
  const [newColor, setNewColor] = useState('#6366f1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<StatusType>('todo');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editProgress, setEditProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
    queryClient.invalidateQueries({ queryKey: ['boards'] });
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.statuses.create({ boardId, name: newName.trim(), type: newType, color: newColor });
      toast.success('Status created');
      setNewName('');
      setNewType('todo');
      setNewColor('#6366f1');
      setAdding(false);
      invalidate();
    } catch (err) {
      toast.error('Failed to create status', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (status: Status) => {
    setEditingId(status.id);
    setEditName(status.name);
    setEditType(status.type);
    setEditColor(status.color ?? '#6366f1');
    setEditProgress(status.progress ?? 0);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const data: Record<string, any> = { name: editName, type: editType, color: editColor };
      if (isProgressEditable(editType)) {
        data.progress = editProgress;
      }
      await api.statuses.update(editingId, data);
      toast.success('Status updated');
      setEditingId(null);
      invalidate();
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (statusId: string) => {
    try {
      await api.statuses.delete(statusId);
      toast.success('Status deleted');
      invalidate();
    } catch (err) {
      toast.error('Failed to delete status', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleReorder = async (status: Status, direction: 'up' | 'down') => {
    const sorted = [...statuses].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === status.id);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const items = sorted.map((s, i) => ({ id: s.id, position: i }));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    try {
      await api.statuses.reorder(items);
      invalidate();
    } catch (err) {
      toast.error('Failed to reorder', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <CardTitle className="text-base text-foreground">Statuses</CardTitle>
        <CardDescription className="text-sm text-muted-foreground mt-1">
          Manage columns and their issue status types for this board.
        </CardDescription>
      </div>

      <div className="flex flex-col">
        {statuses.map((status) => (
          <div key={status.id} className="border-b border-border last:border-0">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <ProgressIcon progress={status.progress ?? 0} type={status.type} size={16} />
                <span className="text-sm text-foreground">{status.name}</span>
                <Badge
                  variant="secondary"
                  className="text-xs text-muted-foreground bg-muted rounded-sm px-1.5 py-0.5 border-0 font-mono"
                >
                  {TYPE_OPTIONS.find((t) => t.value === status.type)?.label ?? status.type}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">
                  {status._count?.tasks ?? 0}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleReorder(status, 'up')}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => handleReorder(status, 'down')}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => startEdit(status)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(status.id)}
                  aria-label="Delete status"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {editingId === status.id && (
              <div className="pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Name</UILabel>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 w-48"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Type</UILabel>
                    <Select value={editType} onValueChange={(v) => setEditType(v as StatusType)}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <UILabel className="text-xs text-muted-foreground">Color</UILabel>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-8 w-9 rounded-md border border-border bg-background cursor-pointer"
                    />
                  </div>
                  {isProgressEditable(editType) && (
                    <div className="flex flex-col gap-1">
                      <UILabel className="text-xs text-muted-foreground">Progress</UILabel>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editProgress}
                        onChange={(e) => setEditProgress(parseInt(e.target.value, 10) || 0)}
                        className="h-8 w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {statuses.length === 0 && (
          <p className="text-sm text-muted-foreground py-3">No statuses yet</p>
        )}
      </div>

      {/* Add status form */}
      {adding ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Name</UILabel>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Status name..."
                className="h-8 w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Type</UILabel>
              <Select value={newType} onValueChange={(v) => setNewType(v as StatusType)}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <UILabel className="text-xs text-muted-foreground">Color</UILabel>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-9 rounded-md border border-border bg-background cursor-pointer"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed border-border text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus data-icon="inline-start" />
          Add Status
        </Button>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Rewrite board-settings-page.tsx as the tabbed layout**

Replace `apps/web/src/pages/board-settings-page.tsx` with a layout component that fetches the board, renders tabs, and uses `<Outlet />` for child routes. The section components are imported from the `board-settings/` directory.

The layout needs to:

1. Fetch the board via `useBoardFull` (or `useParams` + the existing board query).
2. Render the 48px header (back arrow + board icon + name + "— Settings").
3. Render a horizontal tab bar: General, Statuses, Labels, Members, Danger.
4. Use `<NavLink>` for tab styling (active = border-bottom or subtle bg, no Acid Lime).
5. Render `<Outlet />` with the board context.

```typescript
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBoardFull } from '@/hooks/use-boards';
import { SidebarLayout } from '@/components/sidebar-layout';

const TABS = [
  { to: 'general', label: 'General' },
  { to: 'statuses', label: 'Statuses' },
  { to: 'labels', label: 'Labels' },
  { to: 'members', label: 'Members' },
  { to: 'danger', label: 'Danger' },
];

export function BoardSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: board } = useBoardFull(id!);

  return (
    <div className="flex flex-col h-full">
      {/* Header — 48px */}
      <div className="h-12 shrink-0 px-4 flex items-center gap-2 border-b border-border">
        <NavLink to={`/board/${id}`}>
          <ArrowLeft className="size-4 text-muted-foreground hover:text-foreground" />
        </NavLink>
        <span className="text-lg">{board?.icon ?? '⭐'}</span>
        <span className="text-sm font-medium text-foreground">{board?.name}</span>
        <span className="text-sm text-muted-foreground">— Settings</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b border-border">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-3 py-2 text-sm rounded-none border-b-2 transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Outlet context={{ board }} />
      </div>
    </div>
  );
}
```

Note: The section components currently receive props directly. With the Outlet pattern, they can use `useOutletContext()` to get the board, OR we pass props via the route element. The simplest approach: each route element passes the board to the section as props. See Step 4.

- [ ] **Step 4: Update routing in app.tsx**

In `apps/web/src/app.tsx`, replace the board settings route (lines 60-67) with nested routes:

```typescript
        <Route
          path="/board/:id/settings"
          element={
            <SidebarLayout>
              <BoardSettingsPage />
            </SidebarLayout>
          }
        >
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<GeneralSettingsRoute />} />
          <Route path="statuses" element={<StatusesSettingsRoute />} />
          <Route path="labels" element={<LabelsSettingsRoute />} />
          <Route path="members" element={<MembersSettingsRoute />} />
          <Route path="danger" element={<DangerSettingsRoute />} />
        </Route>
```

Add `Navigate` to the react-router-dom import at the top:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
```

Create route wrapper components. These can live in `board-settings-page.tsx` or in a separate `board-settings/routes.tsx`. The simplest: add them to `board-settings-page.tsx`:

```typescript
import { useOutletContext } from 'react-router-dom';
import { GeneralSection } from './board-settings/general-section';
import { StatusesSection } from './board-settings/statuses-section';
import { LabelsSection } from './board-settings/labels-section';
import { MembersSection } from './board-settings/members-section';
import { DeleteBoardSection } from './board-settings/danger-section';

function GeneralSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  return <GeneralSection boardId={board.id} boardName={board.name} boardIcon={board.icon} />;
}

function StatusesSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  return <StatusesSection boardId={board.id} statuses={board.statuses ?? []} />;
}

function LabelsSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  return <LabelsSection boardId={board.id} labels={board.labels ?? []} />;
}

function MembersSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  return <MembersSection boardId={board.id} />;
}

function DangerSettingsRoute() {
  const { board } = useOutletContext<{ board: any }>();
  return <DeleteBoardSection boardId={board.id} boardName={board.name} />;
}
```

Export these route components or define them in `app.tsx` — whichever is cleaner. The cleanest: export from `board-settings-page.tsx` and import in `app.tsx`.

- [ ] **Step 5: Remove AddStatusForm from kanban-board.tsx**

In `apps/web/src/components/kanban-board.tsx`:

1. Remove the `AddStatusForm` component definition (lines 431-485).
2. Remove the add-status rendering (lines 344-347 — the `<div className="w-[348px] shrink-0"><AddStatusForm boardId={board.id} /></div>` block).
3. Update the "Edit status" navigation (line 288) from `navigate(`/board/${id}/settings`)` to `navigate(`/board/${id}/settings/statuses`)`.

- [ ] **Step 6: Update the board-settings-page test**

In `apps/web/src/pages/board-settings-page.test.tsx`, update the import to use the new `DeleteBoardSection` location:

```typescript
import { DeleteBoardSection } from './board-settings/danger-section';
```

The existing `DeleteBoardSection` tests should work unchanged since the component has the same props and behavior.

- [ ] **Step 7: Add StatusesSection tests**

Create `apps/web/src/pages/board-settings/statuses-section.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { StatusesSection } from './statuses-section';
import type { Status } from '@/types';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockReorder = vi.fn();

vi.mock('@/hooks/api', () => ({
  api: {
    statuses: {
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      delete: (...args: any[]) => mockDelete(...args),
      reorder: (...args: any[]) => mockReorder(...args),
      list: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const statuses: Status[] = [
  { id: 's1', boardId: 'b1', name: 'Backlog', type: 'backlog', position: 0, progress: 0, _count: { tasks: 2 } },
  { id: 's2', boardId: 'b1', name: 'Todo', type: 'todo', position: 1, progress: 0, _count: { tasks: 0 } },
  { id: 's3', boardId: 'b1', name: 'In Progress', type: 'in_progress', position: 2, progress: 50, _count: { tasks: 1 } },
  { id: 's4', boardId: 'b1', name: 'Done', type: 'done', position: 3, progress: 100, _count: { tasks: 5 } },
];

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StatusesSection boardId="b1" statuses={statuses} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StatusesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockReorder.mockReset();
  });

  it('renders all statuses with their names and type badges', () => {
    renderSection();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('backlog')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('shows task counts per status', () => {
    renderSection();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('opens add form on "Add Status" click', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByText(/add status/i));
    expect(screen.getByPlaceholderText('Status name...')).toBeInTheDocument();
  });

  it('creates a status with name, type, and color', async () => {
    mockCreate.mockResolvedValueOnce({ id: 's5', name: 'Triage', type: 'triage' });
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByText(/add status/i));
    await user.type(screen.getByPlaceholderText('Status name...'), 'Triage');
    await user.click(screen.getByText('Add'));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'b1', name: 'Triage', type: 'todo' }),
      );
    });
  });

  it('opens edit form on "Edit" click and saves changes', async () => {
    mockUpdate.mockResolvedValueOnce({ id: 's1', name: 'Icebox', type: 'backlog' });
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[0]);
    const nameInput = screen.getByDisplayValue('Backlog');
    await user.clear(nameInput);
    await user.type(nameInput, 'Icebox');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Icebox' }));
    });
  });

  it('deletes a status on trash icon click', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderSection();
    const deleteButtons = screen.getAllByLabelText('Delete status');
    await user.click(deleteButtons[0]);
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('s1');
    });
  });

  it('reorders up on arrow up click', async () => {
    mockReorder.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderSection();
    const upButtons = screen.getAllByLabelText('Move up');
    await user.click(upButtons[1]);
    await waitFor(() => {
      expect(mockReorder).toHaveBeenCalled();
    });
  });

  it('hides progress input for locked types (backlog)', async () => {
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[0]);
    expect(screen.queryByText('Progress')).not.toBeInTheDocument();
  });

  it('shows progress input for editable types (in_progress)', async () => {
    const user = userEvent.setup();
    renderSection();
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[2]);
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Baseline 1 pre-existing error in `kanban-board.tsx`. No new errors. If there are errors from the section extraction (missing imports, etc.), fix them.

- [ ] **Step 9: Run web tests**

Run: `pnpm --filter @taskforge/web test`
Expected: All tests pass, including the new StatusesSection tests.

- [ ] **Step 10: Run format check**

Run: `pnpm format:check`
If formatting issues: `pnpm format`

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/
git commit -m "feat: restructure board settings into tabbed layout with statuses CRUD

Board settings split into tabbed child routes: general, statuses, labels,
members, danger. StatusesSection has full CRUD: add (name+type+color),
edit (name/type/color/progress), reorder (up/down), delete. Kanban board
AddStatusForm removed; 'Edit status' navigates to settings/statuses."
```

---

### Task 12: Run full test suite and verify

**Files:**

- None (verification only)

- [ ] **Step 1: Run API tests**

Run: `pnpm --filter @taskforge/api test`
Expected: All tests PASS.

- [ ] **Step 2: Run web tests**

Run: `pnpm --filter @taskforge/web test`
Expected: All tests PASS.

- [ ] **Step 3: Run web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 1 pre-existing error in `kanban-board.tsx` (the DraggingStyle/CSSProperties issue). No new errors.

- [ ] **Step 4: Run format check**

Run: `pnpm format:check`
Expected: All files formatted.

- [ ] **Step 5: Verify the migration applies cleanly**

Run:

```bash
cd apps/api && pnpm prisma:migrate
```

Expected: Migration applies without errors. If there's an existing dev DB, verify the `type` column is populated correctly:

```bash
npx prisma studio
```

Or query directly to check a few statuses have the right `type` values.

- [ ] **Step 6: Final commit (if any formatting fixes needed)**

```bash
git add -A
git commit -m "chore: formatting and final verification"
```

Only if there are changes to commit.
