# Task Estimation Field (TFG-29) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nullable numeric `estimate` field to tasks, editable in the detail sidebar, shown on board cards, and exposed through REST + MCP.

**Architecture:** A `Float?` column on `Task` flows through Prisma → DTOs → TasksService → MCP → web `Task` type → a new `DetailEstimateInput` in the properties sidebar → a read-only chip on `TaskCard`. Clearing uses `null` and works because update guards on `!== undefined`. Public payload is untouched.

**Tech Stack:** NestJS 11 (CommonJS, `strict: false`), Prisma 6 + SQLite, class-validator, Zod (MCP), React 19 (ESM, `strict: true`), Vitest.

## Global Constraints

- API is CommonJS and `strict: false`; web is ESM and `strict: true`. Never add `strict: true` to `apps/api/tsconfig.json`.
- Prettier is canonical (single quotes, semicolons, trailing commas, print width 100). Run `pnpm format:check` before committing.
- Do not add comments unless the _why_ is non-obvious. Match local style.
- `design.md`: the estimate chip on the card is plain metadata (mono, muted), never Acid Lime or bright fills.
- Public task payload stays `select`-only; do NOT add `estimate` to `public.service.ts`.
- No aggregation/velocity tracking — this is a single stored field.

---

### Task 1: Schema migration + API DTOs

**Files:**

- Modify: `apps/api/prisma/schema.prisma:110-146`
- Modify: `apps/api/src/tasks/dto/task.dto.ts`
- Create: migration SQL under `apps/api/prisma/migrations/` (via command)

**Interfaces:**

- Produces: `estimate?: number` on `CreateTaskDto`, `estimate?: number | null` on `UpdateTaskDto`; `Task.estimate: number | null` on the Prisma model. Later tasks rely on these field names.

- [ ] **Step 1: Add the column to the Prisma schema**

In `apps/api/prisma/schema.prisma`, inside the `Task` model, add after the `metadata` line (line 122):

```prisma
  estimate    Float?    // effort estimate, freeform positive number
```

- [ ] **Step 2: Create and apply the migration**

Run: `pnpm --filter @taskforge/api prisma:migrate -- --name add_task_estimate`
Expected: a new migration folder `apps/api/prisma/migrations/<timestamp>_add_task_estimate/` with `migration.sql` containing `ALTER TABLE "tasks" ADD COLUMN "estimate" REAL` (SQLite uses `REAL` for `Float`). Verify with `git status` that the migration file and `schema.prisma` changed.

- [ ] **Step 3: Add DTO fields**

In `apps/api/src/tasks/dto/task.dto.ts`:

Import `Min` in the class-validator import (line 1):

```ts
import { IsString, IsOptional, IsNumber, IsArray, IsDateString, Min } from 'class-validator';
```

Add to `CreateTaskDto` (after the `dueDate` block, ~line 29):

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimate?: number;
```

Add to `UpdateTaskDto` (after the `dueDate` block, ~line 72):

```ts
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimate?: number | null;
```

- [ ] **Step 4: Typecheck the API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS (no output). If the migration produced a stale generated client, run `pnpm --filter @taskforge/api prisma:generate` first.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/tasks/dto/task.dto.ts
git commit -m "feat(api): add nullable estimate column to tasks"
```

---

### Task 2: TasksService — create/update/activity

**Files:**

- Modify: `apps/api/src/tasks/tasks.service.ts`
- Test: `apps/api/src/tasks/tasks.service.spec.ts`

**Interfaces:**

- Consumes: `CreateTaskDto.estimate?: number`, `UpdateTaskDto.estimate?: number | null` (Task 1).
- Produces: persisted `estimate` on created/updated tasks; activity `detail` entries like `estimate: unset → 3` and `estimate cleared`.

- [ ] **Step 1: Write the failing tests**

Append these to `describe('create')` in `apps/api/src/tasks/tasks.service.spec.ts` (after the "should log activity with system actor" test, ~line 193):

```ts
it('should create a task with an estimate', async () => {
  const task = await service.create(
    { statusId: board.statuses[0].id, title: 'Estimated', estimate: 3 },
    user,
  );
  expect(task.estimate).toBe(3);
});
```

Append these to `describe('update')` (after `should log activity on update`, ~line 222):

```ts
it('should update task estimate', async () => {
  const seeded = await seedTask(prisma, board.statuses[0].id);
  const updated = await service.update(seeded.id, { estimate: 5 }, user);
  expect(updated.estimate).toBe(5);
});

it('should clear task estimate with null', async () => {
  const seeded = await seedTask(prisma, board.statuses[0].id, { estimate: 5 });
  const updated = await service.update(seeded.id, { estimate: null }, user);
  expect(updated.estimate).toBeNull();
});

it('should log estimate change in activity detail', async () => {
  const seeded = await seedTask(prisma, board.statuses[0].id, { estimate: 2 });
  await service.update(seeded.id, { estimate: 8 }, user);
  const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
  const updated = activity.find((a: any) => a.action === 'updated');
  expect(updated).toBeDefined();
  expect(
    JSON.parse(updated!.detail).changes.some((c: string) => c.includes('estimate: 2 → 8')),
  ).toBe(true);
});

it('should log estimate clear in activity detail', async () => {
  const seeded = await seedTask(prisma, board.statuses[0].id, { estimate: 5 });
  await service.update(seeded.id, { estimate: null }, user);
  const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
  const updated = activity.find((a: any) => a.action === 'updated');
  expect(updated).toBeDefined();
  expect(JSON.parse(updated!.detail).changes.some((c: string) => c === 'estimate cleared')).toBe(
    true,
  );
});
```

Note: `seedTask` accepts arbitrary overrides via `rest` and spreads them into the create `data`, so `{ estimate: 5 }` just works — no setup change needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @taskforge/api test -- --testPathPattern=tasks.service`
Expected: FAIL — `create` returns a task without an `estimate` (column exists but service never sets it), so `task.estimate` is `undefined` / assertions fail.

- [ ] **Step 3: Implement the service changes**

In `apps/api/src/tasks/tasks.service.ts`:

In `create`, inside the `tx.task.create({ data: { ... } })` block, add after the `dueDate` line (line 233):

```ts
          estimate: dto.estimate ?? null,
```

In `update`, add after the `dueDate` line (line 275):

```ts
if (dto.estimate !== undefined) changes.estimate = dto.estimate;
```

In `update`, inside the `const detail: string[] = [];` block, add after the `dueDate`/assignee lines (after line 318):

```ts
if (dto.estimate !== undefined && dto.estimate !== existing.estimate) {
  detail.push(
    dto.estimate === null
      ? 'estimate cleared'
      : `estimate: ${existing.estimate ?? 'unset'} → ${dto.estimate}`,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPattern=tasks.service`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/tasks.service.ts apps/api/src/tasks/tasks.service.spec.ts
git commit -m "feat(api): persist and log task estimate on create/update"
```

---

### Task 3: MCP — estimate in tool definitions and service

**Files:**

- Modify: `apps/api/src/mcp/tool-definitions.ts`
- Modify: `apps/api/src/mcp/mcp.service.ts`
- Test: `apps/api/src/mcp/mcp.service.spec.ts`

**Interfaces:**

- Consumes: `estimate` on the persisted task (Task 2).
- Produces: `estimate` param in the `tasks_create` and `tasks_update` MCP input schemas; persistence in the MCP create/update cases.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/mcp/mcp.service.spec.ts`, inside `describe('tasks_create')` add (after `should record activity...` at ~line 403):

```ts
it('should create a task with an estimate', async () => {
  const res = await service.handleRequest(
    {
      method: 'tasks_create',
      params: { statusId: board.statuses[0].id, title: 'Estimated task', estimate: 3 },
      id: 22,
    },
    user,
  );
  expect(res.result.estimate).toBe(3);
});
```

Inside `describe('tasks_update')` add:

```ts
it('should update a task estimate', async () => {
  const task = await seedTask(prisma, board.statuses[0].id, { estimate: 2 });
  const res = await service.handleRequest(
    { method: 'tasks_update', params: { id: task.id, estimate: 13 }, id: 23 },
    user,
  );
  expect(res.result.estimate).toBe(13);
});

it('should clear a task estimate with null', async () => {
  const task = await seedTask(prisma, board.statuses[0].id, { estimate: 8 });
  const res = await service.handleRequest(
    { method: 'tasks_update', params: { id: task.id, estimate: null }, id: 24 },
    user,
  );
  expect(res.result.estimate).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service`
Expected: FAIL — `res.result.estimate` is `undefined` because the create/update paths ignore `estimate`.

- [ ] **Step 3: Implement**

In `apps/api/src/mcp/tool-definitions.ts`, add to `tasks_create`'s `inputSchema` (after `dueDate`, line 162):

```ts
      estimate: z.number().optional(),
```

Add to `tasks_update`'s `inputSchema` (after `dueDate`, line 179):

```ts
      estimate: z.number().nullable().optional(),
```

In `apps/api/src/mcp/mcp.service.ts`, in the `create` case `data` block add after the `dueDate` line (line 423):

```ts
              estimate: params.estimate ?? null,
```

In the `update` case, add after the `dueDate` line (line 458):

```ts
if (params.estimate !== undefined) data.estimate = params.estimate;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @taskforge/api test -- --testPathPattern=mcp.service`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mcp/tool-definitions.ts apps/api/src/mcp/mcp.service.ts apps/api/src/mcp/mcp.service.spec.ts
git commit -m "feat(api): expose task estimate through MCP"
```

---

### Task 4: Web — Task type + optimistic create + card chip

**Files:**

- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/hooks/use-tasks.ts`
- Modify: `apps/web/src/components/task-card.tsx`
- Test: `apps/web/src/components/task-card.test.tsx` (new)

**Interfaces:**

- Consumes: `task.estimate?: number | null` from the API payload.
- Produces: `Task.estimate?: number | null` on the type; optimistic tasks carry `estimate: null`; a read-only chip rendered on cards when `estimate != null`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/task-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '@/types';
import { TaskCard } from './task-card';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TF-1',
    title: 'Test task',
    position: 0,
    priority: 'medium',
    doneAt: null,
    assigneeId: null,
    parentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _count: { comments: 0 },
    ...overrides,
  };
}
```

Then the test body — render the card with an estimate and assert the chip appears; render without one and assert it does not:

```tsx
describe('TaskCard', () => {
  it('shows a read-only estimate chip when an estimate is set', () => {
    render(<TaskCard task={makeTask({ estimate: 3 })} />);
    expect(screen.getByText('3 pts')).toBeInTheDocument();
  });

  it('hides the estimate chip when none is set', () => {
    render(<TaskCard task={makeTask({ estimate: null })} />);
    expect(screen.queryByText('pts')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/task-card.test.tsx`
Expected: FAIL — `getByText('3 pts')` finds nothing (chip not implemented), and the file may fail to compile if `estimate` is not on the `Task` type yet.

- [ ] **Step 3: Add the type field**

In `apps/web/src/types/index.ts`, inside `interface Task` add after `dueDate` (line 43):

```ts
  estimate?: number | null;
```

- [ ] **Step 4: Add optimistic estimate**

In `apps/web/src/hooks/use-tasks.ts`, in the `optimisticTask` object in `useCreateTask` (after `doneAt`, line 49):

```ts
        estimate: null,
```

- [ ] **Step 5: Render the estimate chip on the card**

In `apps/web/src/components/task-card.tsx`:

Extend `hasRow2` (line 86-90) to include an estimate:

```ts
const hasRow2 =
  !!parentTaskNumber ||
  visibleLabels.length > 0 ||
  task.estimate != null ||
  (task._count && task._count.comments > 0) ||
  (task.blockedByCount != null && task.blockedByCount > 0);
```

Add the chip into the meta row, after the blocked indicator block and before the LabelManager div (after line 174):

```tsx
{
  task.estimate != null && (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground font-mono shrink-0">
      {task.estimate} pts
    </span>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/task-card.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (3 pre-existing in `kanban-board.tsx`, `ui/dropdown-menu.tsx`, `use-labels.ts` — count must not grow).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/hooks/use-tasks.ts apps/web/src/components/task-card.tsx apps/web/src/components/task-card.test.tsx
git commit -m "feat(web): add estimate field to task type and card chip"
```

---

### Task 5: Web — Detail sidebar estimate control

**Files:**

- Create: `apps/web/src/components/detail-estimate-input.tsx`
- Modify: `apps/web/src/components/detail-properties-sidebar.tsx`
- Test: `apps/web/src/components/detail-estimate-input.test.tsx` (new)

**Interfaces:**

- Consumes: `task.estimate?: number | null`, `onUpdate({ estimate })` from `DetailPropertiesSidebar`.
- Produces: `<DetailEstimateInput value={number | null} onChange={(n: number | null) => void} />` rendered as a property row labelled "Estimate".

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/detail-estimate-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailEstimateInput } from './detail-estimate-input';

describe('DetailEstimateInput', () => {
  it('renders the current estimate', () => {
    render(<DetailEstimateInput value={5} onChange={() => {}} />);
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  it('renders empty when no estimate is set', () => {
    render(<DetailEstimateInput value={null} onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/estimate/i)).toBeInTheDocument();
  });

  it('calls onChange with the parsed number', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DetailEstimateInput value={null} onChange={onChange} />);
    await user.type(screen.getByPlaceholderText(/estimate/i), '3');
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/detail-estimate-input.test.tsx`
Expected: FAIL — module `./detail-estimate-input` not found.

- [ ] **Step 3: Implement the control**

Create `apps/web/src/components/detail-estimate-input.tsx`:

```tsx
/**
 * DetailEstimateInput — freeform numeric estimate row for the properties sidebar.
 *
 * A plain number input (no preset scale). Empty input means no estimate; any
 * non-empty value parses to a number and clears the field into a placeholder
 * when set to null. Commits on blur and Enter so typing partial values like "5."
 * never fires a premature update.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { DetailPropertyRow } from './detail-property-row';

interface DetailEstimateInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function DetailEstimateInput({ value, onChange }: DetailEstimateInputProps) {
  const [text, setText] = useState(value === null ? '' : String(value));

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      onChange(null);
    } else {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        onChange(parsed);
      }
    }
  };

  return (
    <DetailPropertyRow label="Estimate">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="No estimate"
        aria-label="Estimate"
        className="h-7 w-20 px-2 text-sm text-right font-mono"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </DetailPropertyRow>
  );
}
```

Note: keep the `text` state synced if the parent value changes from elsewhere; the initializer covers the first render, which is all the sidebar needs.

- [ ] **Step 4: Wire it into the sidebar**

In `apps/web/src/components/detail-properties-sidebar.tsx`, import it (after the `DetailPrioritySelect` import, line 19):

```tsx
import { DetailEstimateInput } from './detail-estimate-input';
```

Add the row in the Properties group, between `DetailPrioritySelect` and `DetailAssigneeSelect` (after line 72):

```tsx
<DetailEstimateInput
  value={task.estimate ?? null}
  onChange={(estimate) => onUpdate({ estimate })}
/>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/detail-estimate-input.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Format check**

Run: `pnpm format:check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/detail-estimate-input.tsx apps/web/src/components/detail-estimate-input.test.tsx apps/web/src/components/detail-properties-sidebar.tsx
git commit -m "feat(web): add estimate input to task detail sidebar"
```

---

### Task 6: Full verification + web regression

**Files:** none (verification only)

- [ ] **Step 1: Run the API test suite**

Run: `pnpm --filter @taskforge/api test`
Expected: PASS.

- [ ] **Step 2: Run the web test suite**

Run: `pnpm --filter @taskforge/web test`
Expected: PASS (all files, incl. the new card + estimate input tests).

- [ ] **Step 3: Format check**

Run: `pnpm format:check`
Expected: PASS.
