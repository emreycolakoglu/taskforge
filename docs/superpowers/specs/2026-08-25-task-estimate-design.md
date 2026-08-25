# Task Estimation Field (TFG-29)

## Problem

Tasks have no way to carry an effort estimate. Teams planning a board must
either encode estimates in the title/description or ignore them entirely.

## Scope

A single nullable numeric `estimate` field on tasks, exposed through the REST
API, MCP, the task detail sidebar, and the board card. No aggregation, no
speed/velocity tracking, no per-board toggle.

## Decisions (from brainstorming)

- **Freeform number** — any non-negative number, no preset scale (explicitly
  not Fibonacci story points or hours).
- **Sidebar + card** — editable in the task detail's Properties sidebar;
  read-only compact chip on board cards when set.
- **Not in the create dialog** — estimates are set when refining a task, not
  when spawning one.
- **Not in the public payload** — the public task projection is deliberately
  minimal; estimates are internal planning data.

## Data model

Add to the `Task` model in `apps/api/prisma/schema.prisma`:

```prisma
estimate Float? // effort estimate, freeform positive number
```

New SQLite migration via `pnpm --filter @taskforge/api prisma:migrate -- --name add_task_estimate`.

## API

### DTOs (`apps/api/src/tasks/dto/task.dto.ts`)

- `CreateTaskDto.estimate?: number` with `@IsOptional() @IsNumber() @Min(0)`.
- `UpdateTaskDto.estimate?: number | null` with the same decorators — `null`
  clears the estimate.

### TasksService (`apps/api/src/tasks/tasks.service.ts`)

- `create`: `estimate: dto.estimate ?? null`.
- `update`: `if (dto.estimate !== undefined) changes.estimate = dto.estimate;`
  (the `!== undefined` guard makes clearing to `null` work, unlike the truthy
  checks used for title/priority).
- Activity: when changed, push to the `detail` array:
  - set: `` `estimate: ${existing.estimate ?? 'unset'} → ${dto.estimate}` ``
  - cleared: `estimate cleared`.

### MCP (`apps/api/src/mcp/`)

- `tool-definitions.ts`: add `estimate: z.number().optional()` to both
  `tasks_create` and `tasks_update`.
- `mcp.service.ts`: `create` case → `estimate: params.estimate ?? null`;
  `update` case → `if (params.estimate !== undefined) data.estimate = params.estimate;`.

### Public (`apps/api/src/public/public.service.ts`)

Not included — `select`-based projection stays as-is; no estimate rides along.

## Web

### Types (`apps/web/src/types/index.ts`)

```ts
estimate?: number | null;
```

### Detail sidebar (`apps/web/src/components/detail-properties-sidebar.tsx`)

New `DetailEstimateInput` component in the Properties group, after Priority and
before Assignee. A small number input with a clear affordance; empty = no
estimate. Renders through `DetailPropertyRow` (label "Estimate") and calls
`onUpdate({ estimate })`.

### Task card (`apps/web/src/components/task-card.tsx`)

When `task.estimate != null`, show a compact read-only estimate chip in the
meta row (`hasRow2`) among the comments/blocked indicators — mono, muted, e.g.
`3 pts`. No acid-lime; plain metadata text per design.md.

### Optimistic create (`apps/web/src/hooks/use-tasks.ts`)

Optimistic task in `useCreateTask` gets `estimate: null` so the type is complete.

## Testing

- **API** (`apps/api/src/tasks/tasks.service.spec.ts`): create with estimate
  persists; update sets/clears it; activity records `estimate` changes; `Min(0)`
  validation rejects negatives. Follow existing seed/assert patterns.
- **MCP** (`apps/api/src/mcp/mcp.service.spec.ts`): `tasks_create` with
  `estimate` persists; `tasks_update` sets and clears.
- **Web** (`apps/web/src/components/detail-properties-sidebar.test.tsx` if
  present, else component test on the new estimate control): renders the value,
  edits persist via `onUpdate`; card test asserts the estimate chip renders and
  is absent when unset.

## Success criteria

- A user can set and clear an estimate from the task detail sidebar; it renders
  on the board card.
- Estimates round-trip through REST and MCP; updates appear in activity.
- Public task pages never expose estimates.
