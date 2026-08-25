# Sidebar Docs Link Per Board (TFG-28) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Docs" link under each board in the sidebar, above "Settings".

**Architecture:** Frontend-only. In `sidebar-layout.tsx`, the per-board `CollapsibleContent` gets a new "Docs" `SidebarMenuButton` above the existing "Settings" one, plus a `docsActive` flag (covering the docs index and the doc editor route) folded into `boardActive`.

**Tech Stack:** React 19, TypeScript (strict), shadcn sidebar primitives, Vitest + Testing Library.

## Global Constraints

- Web app is ESM and `strict: true`. Do not add comments.
- Prettier is the canonical formatter (single quotes, semicolons, trailing commas, print width 100). Run `pnpm format:check` before committing.
- Follow `design.md` — the new link mirrors the existing Settings link exactly (no icon, `size="sm"`, `pl-2`).
- Route `/board/:boardId/docs` and `BoardDocumentsPage` already exist — do not touch them.

---

### Task 1: Add the Docs link and active state

**Files:**

- Modify: `apps/web/src/components/sidebar-layout.tsx:187-232`
- Test: `apps/web/src/components/sidebar-layout.test.tsx`

**Interfaces:**

- Consumes: existing `Link`, `SidebarMenuButton` from `@/components/ui/sidebar`; existing route `/board/:boardId/docs`.
- Produces: a per-board "Docs" link at `/board/${board.id}/docs` that is active (`isActive`) when `location.pathname` is `/board/${board.id}/docs` or starts with `/board/${board.id}/doc/`.

- [ ] **Step 1: Write the failing tests**

Add two tests to `apps/web/src/components/sidebar-layout.test.tsx`, after the `renders settings link in bottom section` test (line ~192):

```tsx
it('renders a Docs link under each board', () => {
  renderSidebar();

  const docsLinks = screen.getAllByRole('link', { name: 'Docs' });
  expect(docsLinks).toHaveLength(3);
  expect(docsLinks[0]).toHaveAttribute('href', '/board/b1/docs');
});

it('highlights the Docs link when on a board docs page', () => {
  renderSidebar('/board/b1/docs');

  const docsLink = screen.getByRole('link', { name: 'Docs' });
  expect(docsLink).toHaveAttribute('href', '/board/b1/docs');
  expect(docsLink.closest('[data-active="true"]')).not.toBeNull();
});
```

Note: `screen.getAllByRole('link', { name: 'Docs' })` returns all three boards' Docs links in DOM order (b1, b2, 123). The second test uses `renderSidebar('/board/b1/docs')`, which already exists as a helper.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run src/components/sidebar-layout.test.tsx`
Expected: the two new tests FAIL (no "Docs" link found). Existing tests pass.

- [ ] **Step 3: Implement the change**

In `apps/web/src/components/sidebar-layout.tsx`, replace the per-board active-state computation (lines 188-190):

```tsx
const issuesActive = location.pathname === `/board/${board.id}`;
const settingsActive = location.pathname === `/board/${board.id}/settings`;
const boardActive = issuesActive || settingsActive;
```

with:

```tsx
const issuesActive = location.pathname === `/board/${board.id}`;
const docsActive =
  location.pathname === `/board/${board.id}/docs` ||
  location.pathname.startsWith(`/board/${board.id}/doc/`);
const settingsActive = location.pathname === `/board/${board.id}/settings`;
const boardActive = issuesActive || docsActive || settingsActive;
```

Then in the `CollapsibleContent` (lines 221-232), insert the Docs link above the Settings link:

```tsx
<CollapsibleContent>
  <div className="ml-6 flex flex-col gap-0.5">
    <SidebarMenuButton asChild isActive={docsActive} size="sm" className="pl-2">
      <Link to={`/board/${board.id}/docs`}>Docs</Link>
    </SidebarMenuButton>
    <SidebarMenuButton asChild isActive={settingsActive} size="sm" className="pl-2">
      <Link to={`/board/${board.id}/settings`}>Settings</Link>
    </SidebarMenuButton>
  </div>
</CollapsibleContent>
```

- [ ] **Step 4: Run the full sidebar test suite**

Run: `cd apps/web && npx vitest run src/components/sidebar-layout.test.tsx`
Expected: all tests PASS, including the two new ones and the pre-existing settings/active-state tests.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors. (Baseline is 3 pre-existing errors in `kanban-board.tsx`, `ui/dropdown-menu.tsx`, `use-labels.ts` — the count must not grow.)

- [ ] **Step 6: Format check**

Run: `pnpm format:check`
Expected: PASS (no formatting changes needed).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/sidebar-layout.tsx apps/web/src/components/sidebar-layout.test.tsx
git commit -m "feat(web): add docs link under each board in sidebar"
```
