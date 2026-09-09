# Assignee Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add assignee filtering to the board filter row: assignee checkboxes in the "+ Add filter" popover and removable assignee chips beside label chips.

**Architecture:** The filter model already supports assignees end-to-end (`FilterState.assigneeIds`, `applyViewFilters`, saved-view save path, `filtersDeviate`). This plan only adds UI + the two state callbacks. The popover gains an Assignee section fed by `useUserDirectory()`; chips render like label chips.

**Tech Stack:** React 19, React Query (`useUserDirectory`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-assignee-filter-design.md`

## Global Constraints

- Follow design.md tokens — no hardcoded colors, no Lime outside the one CTA.
- Prettier formatting (`pnpm format` before commit).
- Tests: `cd apps/web && npx vitest run <file>`; full suite `pnpm --filter @taskforge/web test`.
- Typecheck: `cd apps/web && npx tsc --noEmit` — 6 pre-existing errors is the baseline; must not grow.

---

### Task 1: Assignee state callbacks in `useBoardViewState`

**Files:**

- Modify: `apps/web/src/hooks/use-board-view-state.ts`
- Test: create `apps/web/src/hooks/use-board-view-state.test.ts`

**Interfaces:**

- Consumes: existing `FilterState`, `EMPTY_FILTERS`, `toggleLabelFilter` pattern.
- Produces: `toggleAssigneeFilter(userId: string): void` and
  `removeFilter(id: string, kind: 'label' | 'assignee'): void` (signature
  CHANGES — was `removeFilter(labelId: string)`), both returned from
  `useBoardViewState(boardId: string)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/use-board-view-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardViewState } from './use-board-view-state';

describe('useBoardViewState — assignee filters', () => {
  it('toggles an assignee on and off', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleAssigneeFilter('u1'));
    expect(result.current.filters.assigneeIds).toEqual(['u1']);

    act(() => result.current.toggleAssigneeFilter('u1'));
    expect(result.current.filters.assigneeIds).toEqual([]);
  });

  it('removeFilter removes by kind without touching the other kind', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleLabelFilter('l1'));
    act(() => result.current.toggleAssigneeFilter('u1'));

    act(() => result.current.removeFilter('u1', 'assignee'));
    expect(result.current.filters.assigneeIds).toEqual([]);
    expect(result.current.filters.labelIds).toEqual(['l1']);

    act(() => result.current.removeFilter('l1', 'label'));
    expect(result.current.filters.labelIds).toEqual([]);
  });

  it('clearFilters resets assigneeIds too', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleAssigneeFilter('u1'));
    act(() => result.current.clearFilters());
    expect(result.current.filters.assigneeIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/hooks/use-board-view-state.test.ts`
Expected: FAIL — `toggleAssigneeFilter is not a function`; `removeFilter` with
two args leaves `assigneeIds` untouched.

- [ ] **Step 3: Implement**

In `use-board-view-state.ts`, add after `toggleLabelFilter` and replace
`removeFilter`:

```ts
const toggleAssigneeFilter = useCallback((userId: string) => {
  setFilters((prev) => ({
    ...prev,
    assigneeIds: prev.assigneeIds.includes(userId)
      ? prev.assigneeIds.filter((id) => id !== userId)
      : [...prev.assigneeIds, userId],
  }));
}, []);

const removeFilter = useCallback((id: string, kind: 'label' | 'assignee') => {
  setFilters((prev) => ({
    ...prev,
    [kind === 'label' ? 'labelIds' : 'assigneeIds']: prev[
      kind === 'label' ? 'labelIds' : 'assigneeIds'
    ].filter((x) => x !== id),
  }));
}, []);
```

Add `toggleAssigneeFilter` to the return object.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/hooks/use-board-view-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-board-view-state.ts apps/web/src/hooks/use-board-view-state.test.ts
git commit -m "feat(web): assignee filter state callbacks in useBoardViewState"
```

---

### Task 2: Assignee section in popover + chips in FilterChipsBar

**Files:**

- Modify: `apps/web/src/components/filter-chips-bar.tsx`
- Modify: `apps/web/src/components/kanban-board.tsx` (wire props, lines ~58, ~455)
- Test: `apps/web/src/components/kanban-board.test.tsx` (FilterChipsBar is
  tested through KanbanBoard; check for a dedicated filter-chips-bar test
  file first and prefer that if it exists)

**Interfaces:**

- Consumes: `toggleAssigneeFilter`, `removeFilter(id, kind)` from Task 1;
  `useUserDirectory()` → `{ data: { id, displayName }[] }` from
  `@/hooks/use-users`; existing `LabelOptionList` styling pattern.
- Produces: new FilterChipsBar props — `assignees: { id: string; displayName: string }[]`,
  `onToggleAssignee: (id: string) => void`, and `onRemoveFilter(id: string,
kind: 'label' | 'assignee')` replacing `onRemoveLabel`.

- [ ] **Step 1: Write the failing tests**

In the KanbanBoard test file's save-as-view/filter describe block, add:

```tsx
it('shows assignee checkboxes in the Add filter popover and filters by them', async () => {
  const user = userEvent.setup();
  useUserDirectoryMock.mockReturnValue({
    data: [
      { id: 'u1', displayName: 'Ada' },
      { id: 'u2', displayName: 'Grace' },
    ],
    isLoading: false,
  });
  renderBoard('/board/b1');

  await user.click(screen.getByRole('button', { name: /add filter/i }));
  expect(screen.getByText('Assignee')).toBeInTheDocument();

  await user.click(screen.getByRole('checkbox', { name: /ada/i }));

  // Chip appears with the assignee name; checking filters the list
  expect(screen.getByText('Grace')).toBeInTheDocument(); // still listed in popover
  expect(screen.getByRole('button', { name: /remove ada filter/i })).toBeInTheDocument();
});

it('renders assignee chips with a remove button', () => {
  // state is client-held; simplest path: toggle through the popover
  // (covered above). This test asserts chip + label chip coexistence.
});
```

Adjust to the actual mock names present in the file — `useUserDirectory` must
be mocked at the top like other `@/hooks/*` mocks:

```tsx
vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => useUserDirectoryMock(),
}));
const useUserDirectoryMock = vi.fn().mockReturnValue({ data: [], isLoading: false });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/kanban-board.test.tsx`
Expected: FAIL — no "Assignee" section, no remove-assignee chip button.

- [ ] **Step 3: Implement FilterChipsBar changes**

In `filter-chips-bar.tsx`:

Props change:

```tsx
interface FilterChipsBarProps {
  filters: FilterState;
  labels: Label[];
  assignees: { id: string; displayName: string }[];
  onToggleLabel: (labelId: string) => void;
  onToggleAssignee: (userId: string) => void;
  onRemoveFilter: (id: string, kind: 'label' | 'assignee') => void;
  onClear: () => void;
  onSaveAsView?: () => void;
}
```

Chips (after the label chips map):

```tsx
{
  filters.assigneeIds.map((assigneeId) => {
    const assignee = assignees.find((a) => a.id === assigneeId);
    if (!assignee) return null;
    return (
      <Badge
        key={assigneeId}
        variant="outline"
        className="inline-flex items-center gap-1 rounded-sm border-border px-2 py-0.5 text-xs text-muted-foreground"
      >
        <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[8px] font-semibold">
          {assignee.displayName.charAt(0).toUpperCase()}
        </span>
        {assignee.displayName}
        <button
          type="button"
          aria-label={`Remove ${assignee.displayName} filter`}
          onClick={() => onRemoveFilter(assigneeId, 'assignee')}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </Badge>
    );
  });
}
```

`hasFilters` becomes `activeLabels.length > 0 || filters.assigneeIds.length > 0`.

Popover body — replace the single-section body:

```tsx
<PopoverContent align="start" className="w-56 p-2">
  <div className="text-xs font-medium text-muted-foreground mb-1.5">Label</div>
  <LabelOptionList
    labels={labels}
    isSelected={(id) => filters.labelIds.includes(id)}
    onToggle={onToggleLabel}
  />
  <div className="mt-2 border-t border-border pt-1.5" />
  <div className="text-xs font-medium text-muted-foreground mb-1.5">Assignee</div>
  {assignees.length === 0 ? (
    <p className="py-1 text-xs text-muted-foreground">No users yet</p>
  ) : (
    <div className="flex flex-col gap-0.5">
      {assignees.map((assignee) => (
        <label
          key={assignee.id}
          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <Checkbox
            checked={filters.assigneeIds.includes(assignee.id)}
            onCheckedChange={() => onToggleAssignee(assignee.id)}
          />
          <span className="flex size-3 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-[8px] font-semibold">
            {assignee.displayName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{assignee.displayName}</span>
        </label>
      ))}
    </div>
  )}
</PopoverContent>
```

Note: the label rows use `onClick={(e) => e.stopPropagation()}` (safe inside
task cards); the popover is not inside a clickable card, so plain labels are
fine — match `LabelOptionList` if consistency is preferred.

Update the docstring: mention both sections and the generalized remove.

- [ ] **Step 4: Wire props in kanban-board.tsx**

In `KanbanBoard`:

```tsx
import { useUserDirectory } from '@/hooks/use-users';
```

Hook (near `const { data: users = [] } = useUsers();`):

```tsx
const { data: directory = [] } = useUserDirectory();
```

Destructure the new callback:

```tsx
const {
  viewMode,
  setViewMode,
  filters,
  toggleLabelFilter,
  toggleAssigneeFilter,
  removeFilter,
  clearFilters,
} = useBoardViewState(id ?? '');
```

FilterChipsBar call site:

```tsx
<FilterChipsBar
  filters={filters}
  labels={labels}
  assignees={directory}
  onToggleLabel={toggleLabelFilter}
  onToggleAssignee={toggleAssigneeFilter}
  onRemoveFilter={removeFilter}
  onClear={clearFilters}
  onSaveAsView={filtersDeviate ? () => setSaveDialogOpen(true) : undefined}
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/kanban-board.test.tsx`
Expected: PASS (all, including the new tests).

- [ ] **Step 6: Full suite, typecheck, format, commit**

```bash
pnpm --filter @taskforge/web test
cd apps/web && npx tsc --noEmit   # expect the 6 pre-existing errors only
pnpm format
git add apps/web/src/components/filter-chips-bar.tsx apps/web/src/components/kanban-board.tsx apps/web/src/components/kanban-board.test.tsx
git commit -m "feat(web): assignee filter UI in board filter row"
```
