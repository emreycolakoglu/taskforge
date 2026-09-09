# Assignee Filter Design

## Problem

The board filter row only offers label filters. The filter model already
supports assignees (`FilterState.assigneeIds`, `applyViewFilters` matching,
saved-view persistence) but there is no UI to set them.

## Requirements

1. The "+ Add filter" popover offers assignee filtering alongside labels.
2. Active assignee filters render as removable chips in the filter row.
3. Saved views capture and re-apply `assigneeIds` (already supported by the
   save path — no change needed there).

## Design

### Add filter popover (`filter-chips-bar.tsx`)

- Header text becomes "Filters" (was "Filter by label").
- Two sections:
  - **Label** — existing `LabelOptionList` (unchanged).
  - **Assignee** — checkbox rows from `useUserDirectory()` (`{id,
displayName}` — same source as mention chips). Row: avatar-initial
    fallback circle (same style as the sidebar avatar) + display name +
    Checkbox. Empty state: "No users yet".
- Section headers: `text-xs font-medium text-muted-foreground`, same treatment
  as the existing popover header.

### Chips

Active assignees render as outline Badge chips identical in style to label
chips: avatar initial + displayName + × remove button. Placed after label
chips.

### State (`use-board-view-state.ts`)

- Add `toggleAssigneeFilter(userId: string)` (same toggle pattern as
  `toggleLabelFilter`).
- Generalize `removeFilter(id: string, kind: 'label' | 'assignee')` — the
  FilterChipsBar remove callback passes the chip kind.
- `clearFilters` already resets all fields — unchanged.
- `filtersDeviate` in `kanban-board.tsx` already counts `assigneeIds` — no
  change.

### Known trade-off (accepted)

The user directory is all users, not board members only. Same trade-off as
mention chips; board-member scoping would need a new endpoint and is out of
scope.

## Files

- Modify: `apps/web/src/hooks/use-board-view-state.ts`
- Modify: `apps/web/src/components/filter-chips-bar.tsx`
- Modify: `apps/web/src/components/kanban-board.tsx` (pass directory +
  assignee callbacks)
- Test: `apps/web/src/hooks/use-board-view-state.test.ts` (if present),
  component tests for chips + popover behavior

## Out of scope

- Priority / due-date / search filter UI (fields exist in the model; UI later).
- Board-member-scoped assignee list.
