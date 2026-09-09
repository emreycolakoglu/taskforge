# Sidebar Board Row: Toggle Instead of Navigate

## Problem

In the sidebar's Boards section, clicking a board name navigates to the board
(`/board/:id`). The collapse chevron is a separate narrow hit target to the
left. The user wants the board-name row to toggle the group's collapse state,
with navigation moved to an explicit sub-item.

## Requirements

1. Clicking the board name row toggles collapse/expand only. It never
   navigates.
2. Navigation to the board happens through a new **Issues** sub-item linking
   to `/board/:id`.
3. The chevron trigger sits to the **right** of the board name (the row is one
   button; the chevron is its trailing icon).

## Design

One change surface: `apps/web/src/components/sidebar-layout.tsx` (plus its
test file). No API, routing, or other component changes.

### Board row (before → after)

Today (sidebar-layout.tsx:201-223): a small `CollapsibleTrigger` button
(chevron, `w-auto px-1`) beside a separate `SidebarMenuButton asChild` Link.

After: a single `SidebarMenuButton` wrapping `CollapsibleTrigger` that spans
the row, with the board icon, name, and a trailing `ChevronRight` (rotates on
open via the existing `group-data-[state=open]/collapsible:rotate-90` class).
`asChild` on the button pairs with `CollapsibleTrigger asChild` so the whole
row is one clickable target.

Structure per board stays a `Collapsible` with `defaultOpen={boardActive}`.

### Sub-items

```
▼ ⭐ TFG
    Issues    → /board/:id        (new; highlight moves here from the name row)
    Docs      → /board/:id/docs   (unchanged)
    Settings  → /board/:id/settings (unchanged)
```

- `issuesActive` (`location.pathname === /board/:id`) now highlights the
  Issues sub-item, not the name row.
- `boardActive` (issues || docs || settings) still drives `defaultOpen` of the
  Collapsible and is unchanged.
- The name row no longer carries an active highlight; it is a disclosure
  control.

### Behavior notes

- Clicking the row when collapsed expands it; clicking again collapses.
  No navigation on either click.
- Icon-collapsed sidebar rail: the row keeps the existing `tooltip={board.name}`;
  clicking toggles (group state), never navigates.
- Mobile: unchanged; route-change auto-close already handled by
  `MobileSidebarCloser`.

### Tests

Update `sidebar-layout.test.tsx`:

- Board name click no longer navigates — assert it toggles instead
  (sub-items appear/disappear).
- Issues sub-item links to `/board/:id`.
- Active-issue state highlights the Issues sub-item.

## Out of scope

- Persisting per-board expand state across reloads.
- Any change to Docs/Settings sub-items beyond keeping them as-is.
