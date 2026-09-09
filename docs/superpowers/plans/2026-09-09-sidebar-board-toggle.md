# Sidebar Board Row Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each board row in the sidebar a collapse/expand toggle (chevron trailing on the right), with navigation moved to a new "Issues" sub-item.

**Architecture:** Single-component change in `SidebarLayout`. Each board's `Collapsible` row becomes one full-width `SidebarMenuButton` wrapping `CollapsibleTrigger` (icon + name + trailing rotating chevron). Sub-items become Issues → `/board/:id`, Docs, Settings. `defaultOpen={boardActive}` auto-expand is retained; `issuesActive` highlight moves from the name row to the Issues sub-item.

**Tech Stack:** React 19, react-router-dom, shadcn Sidebar + Collapsible primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-sidebar-board-toggle-design.md`

## Global Constraints

- Follow `design.md` / AGENTS.md design tokens — no hardcoded colors, no new accents.
- Prettier canonical formatting (single quotes, print width 100); run `pnpm format` before committing.
- Web tests: `cd apps/web && npx vitest run src/components/sidebar-layout.test.tsx`.
- Typecheck explicitly: the web build does not typecheck — `cd apps/web && npx tsc --noEmit` (7 pre-existing errors is the baseline; count must not grow).

---

### Task 1: Board row toggle + Issues sub-item

**Files:**

- Modify: `apps/web/src/components/sidebar-layout.tsx` (board row block, lines ~187-247)
- Modify: `apps/web/src/components/sidebar-layout.test.tsx`

**Interfaces:**

- Consumes: existing `useBoards()` data (`board.id`, `board.name`, `board.icon`), `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` from `@/components/ui/collapsible`, `SidebarMenuButton` from `@/components/ui/sidebar`.
- Produces: no exports change. DOM contract used by tests: board name is a **button** (toggle), each board exposes links named `Issues`, `Docs`, `Settings` with hrefs `/board/:id`, `/board/:id/docs`, `/board/:id/settings`.

- [ ] **Step 1: Rewrite the failing tests**

Replace the two tests `board items link to correct board URLs` and `highlights the active board based on URL` in `sidebar-layout.test.tsx`, and add the new toggle tests. Update the comment in `renders boards section with header and board items` (board names are no longer links).

```tsx
it('renders boards section with header and board items', () => {
  renderSidebar();

  // BOARDS section header — uppercase text link
  const boardsLinks = screen.getAllByRole('link', { name: /boards/i });
  // There are two: primary nav "Boards" and section header "BOARDS"
  const sectionHeader = boardsLinks.find((l) => l.textContent === 'BOARDS');
  expect(sectionHeader).toHaveAttribute('href', '/boards');

  // Plus button for creating a board
  expect(screen.getByLabelText('Create board')).toBeInTheDocument();

  // Board rows render as toggle buttons (not links)
  expect(screen.getByRole('button', { name: /sprint 1/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /sprint 2/i })).toBeInTheDocument();
});

it('board name row is not a navigation link', () => {
  renderSidebar();

  expect(screen.queryByRole('link', { name: /sprint 1/i })).not.toBeInTheDocument();
});

it('board name row toggles the sub-items without navigating', async () => {
  const user = userEvent.setup();
  renderSidebar();
  expect(mockNavigate).not.toHaveBeenCalled();

  // Sub-items are hidden while collapsed
  expect(screen.queryByRole('link', { name: 'Issues' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /sprint 1/i }));

  // Expanding reveals sub-items — no navigation happened
  expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/board/b1');
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/board/b1/docs');
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/board/b1/settings',
  );
  expect(mockNavigate).not.toHaveBeenCalled();

  // Clicking again collapses
  await user.click(screen.getByRole('button', { name: /sprint 1/i }));
  expect(screen.queryByRole('link', { name: 'Issues' })).not.toBeInTheDocument();
});

it('highlights the Issues sub-item when on the board page', () => {
  renderSidebar('/board/123');

  const issuesLink = screen.getByRole('link', { name: 'Issues' });
  expect(issuesLink).toHaveAttribute('href', '/board/123');
  expect(issuesLink.closest('[data-active="true"]')).not.toBeNull();
});
```

Note: on route `/board/123` the Active Board collapsible auto-expands (`defaultOpen={boardActive}`), so its `Issues` link is present without clicking.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/sidebar-layout.test.tsx`
Expected: FAIL — `getByRole('button', { name: /sprint 1/i })` finds nothing (names are still links).

- [ ] **Step 3: Implement the board row change**

In `apps/web/src/components/sidebar-layout.tsx`, replace the per-board row block (the `<div className="flex items-center">…</div>` containing the two `SidebarMenuButton`s and the sub-item `CollapsibleContent`) with:

```tsx
return (
  <Collapsible key={board.id} defaultOpen={boardActive} className="group/collapsible">
    <SidebarMenuItem>
      <CollapsibleTrigger asChild>
        <SidebarMenuButton tooltip={board.name}>
          <span className="text-base leading-none">{board.icon ?? '⭐'}</span>
          <span className="truncate">{board.name}</span>
          <ChevronRight className="ml-auto size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </SidebarMenuButton>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-6 flex flex-col gap-0.5">
          <SidebarMenuButton asChild isActive={issuesActive} size="sm" className="pl-2">
            <Link to={`/board/${board.id}`}>Issues</Link>
          </SidebarMenuButton>
          <SidebarMenuButton asChild isActive={docsActive} size="sm" className="pl-2">
            <Link to={`/board/${board.id}/docs`}>Docs</Link>
          </SidebarMenuButton>
          <SidebarMenuButton asChild isActive={settingsActive} size="sm" className="pl-2">
            <Link to={`/board/${board.id}/settings`}>Settings</Link>
          </SidebarMenuButton>
        </div>
      </CollapsibleContent>
    </SidebarMenuItem>
  </Collapsible>
);
```

Also update the component's docstring (lines ~61-72): change "each board … shown as a collapsible group with Issues / Settings sub-items" to "each board row toggles collapse; sub-items are Issues / Docs / Settings; the row itself never navigates."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/components/sidebar-layout.test.tsx`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `pnpm --filter @taskforge/web test && cd apps/web && npx tsc --noEmit`
Expected: full suite passes; tsc reports exactly the 7 pre-existing errors, no new ones.

- [ ] **Step 6: Format and commit**

```bash
pnpm format
git add apps/web/src/components/sidebar-layout.tsx apps/web/src/components/sidebar-layout.test.tsx
git commit -m "feat(web): board rows toggle collapse; navigation via Issues sub-item"
```
