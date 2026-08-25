# Sidebar Docs Link Per Board (TFG-28)

## Problem

The sidebar's per-board collapsible section exposes only "Settings" under each
board. The documents feature already has a full index page at
`/board/:boardId/docs` (`BoardDocumentsPage`), but there is no way to reach it
from the sidebar — a user has to know the URL.

## Scope

Frontend-only change in `apps/web/`. No API, DTO, route, or component changes:
the route `/board/:boardId/docs` and `BoardDocumentsPage` already exist.

## Change

In `apps/web/src/components/sidebar-layout.tsx`, inside each board's
`CollapsibleContent` (currently lines ~221-232), add a "Docs" link above the
existing "Settings" link, mirroring its markup exactly:

```tsx
<SidebarMenuButton asChild isActive={docsActive} size="sm" className="pl-2">
  <Link to={`/board/${board.id}/docs`}>Docs</Link>
</SidebarMenuButton>
```

### Active-state computation

Replace the current two `location.pathname` checks with three:

- `issuesActive` = `/board/${board.id}` (unchanged)
- `docsActive` = `/board/${board.id}/docs`, plus the doc editor
  `/board/${board.id}/doc/...` prefix
- `settingsActive` = `/board/${board.id}/settings` (unchanged)
- `boardActive` = `issuesActive || docsActive || settingsActive` so the
  board's collapsible stays open while viewing its docs.

The `docsActive` computation covers the editor too so the link stays
highlighted while editing a document, and the board stays expanded.

### Styling

No icon, `size="sm"`, `pl-2` — identical to the Settings link. No new design
tokens; conforms to `design.md` (sidebar secondary nav).

## Testing

Add to `apps/web/src/components/sidebar-layout.test.tsx`:

1. A Docs link renders per board with the correct href
   (`getByRole('link', { name: 'Docs' })` → `href="/board/b1/docs"`).
2. The Docs link is active when on `/board/b1/docs` (renders via
   `renderSidebar('/board/b1/docs')`).

## Success criteria

- A signed-in user on any board can reach that board's docs index in one click
  from the sidebar.
- The Docs link highlights when viewing a board's docs index or a doc editor.
- Existing sidebar tests still pass; no regressions in settings/board active
  states.
