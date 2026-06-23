# Kanban Board Refactor Plan — Linear Task Board Alignment

> Architecture/component-level plan. **Do not implement from this doc blindly — follow the Implementation Order section.** `design.md` is the source of truth for visuals; the saved Linear HTML (`docs/task-board/`) is the reference for structure, hierarchy, and interaction patterns.

## Reference findings (from saved Linear HTML)

Extracted from `Development › All issues.html` (inline styles + DOM):

- **Sidebar width:** 251px (fixed, `--sidebar-width`). Workspace header 44px tall, 8px top margin.
- **Sidebar structure:** workspace switcher (avatar + name + chevron) → primary nav (`Inbox`, `My issues`, `Pulse`, `Workspace`, `Initiatives`, `Projects`, `Views`, `More`) → `Favorites` collapsible section → `Your teams` collapsible section (each team = `Development`/`Webx`/`KAI`, expandable to `Issues`/`Projects`/`Views` children) → bottom: help + profile.
- **Main content header:** breadcrumb (`Development › Issues › All issues`) → horizontal **view tabs** (`All issues`, `Active`, `Backlog`, `Board`, `Design`, `Analysis`, `Backend`, `Web`, `Mobile`, `Review`) as pill-style links, active = filled-ish.
- **Toolbar row (right side of header):** `+ Add filter` icon button → `Display options` icon button → `Open details` icon button → `Open menu` icon button → **`Create new issue`** icon button (the single primary action).
- **Board container:** `data-restore-scroll-view="board-container"`, horizontal scroll. Column header row: **height 50px**, `padding-left: 4px`, total width 1400px.
- **Column width:** **348px** fixed (`--row-header-height: 50px`). Columns laid out in a flex row.
- **Column header:** circular status icon (14×14, dashed/progress ring) + status name (Text) + count (animated number, muted) + `Open menu` icon button (16×16).
- **Issue card (`data-board-item="true"`):** anchor link, single row: `[ID mono] [title] [sub-task/parent ref] [status icon] [assignee avatar 18px]` + trailing badges (priority, labels). Compact, row-like, not a tall card.
- **DnD:** Linear uses `DndDescribedBy`/`DndLiveRegion` — react-beautiful-dnd descendant. We keep `@hello-pangea/dnd`.

## Current state summary

- `sidebar-layout.tsx`: 240px (`w-60`) / 56px (`w-14`) collapsible aside. Workspace header 56px (`h-14`). Nav: `My Tasks` + `BOARDS` section (list of board links) + bottom `Settings`/profile/collapse. No `Inbox`/`Pulse`/`Favorites`/teams hierarchy.
- `kanban-board.tsx`: header (back button + board name/desc + view toggle `List`/`Kanban` + settings icon) → label filter bar (all labels as toggle pills) → board: `ScrollArea` + flex row of `w-72` (288px) columns with `rounded-xl border bg-card/50`. Column header: color dot + name + count + add/delete icons. Cards: `TaskCard` in `Draggable`. Inline `CreateTaskModal` at column bottom. `AddListForm` at row end.
- `task-card.tsx`: tall card — `taskNumber` (mono) + parent badge (top) → title → footer (priority icon + label pills + comments + blocked + assignee avatar). `p-3`, `rounded-md`, `border-border bg-card`.
- `create-task-modal.tsx`: inline card with Input + Add/Cancel. Not a true modal.
- Installed shadcn: avatar, badge, button, card, dialog, dropdown-menu, input, label, popover, scroll-area, select, separator, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

---

## 1. Layout Structure

### 1.1 Page shell

Keep the existing `SidebarLayout` shell (`flex h-screen` aside + main). Changes:

- **Sidebar width:** `w-60` (240px) → **`w-64` (256px)** expanded, `w-14` collapsed stays. Linear is 251px; 256px is the nearest Tailwind step and keeps our grid sane. **[NON-BLOCKING]** if you prefer a custom 251px via arbitrary value, use `w-[251px]`.
- **Main content:** `flex-1 overflow-auto` → change to `flex-1 flex flex-col overflow-hidden` so the board header is sticky and only the board body scrolls horizontally. The board page itself manages its own scroll regions.

### 1.2 Board page regions (top to bottom)

```
┌─ BoardHeaderBar (sticky, h-12, border-b) ───────────────────────────────┐
│ breadcrumb/title  │  view-tabs  │  filter · display · new-issue CTA    │
├─ FilterChipsBar (conditional, h-9, border-b) — only when filters active ─┤
├─ BoardBody (flex-1, overflow-x-auto) ───────────────────────────────────┤
│  ColumnHeader row (h-12.5 ≈ 50px) + vertical card lists per column       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **BoardHeaderBar:** `h-12` (48px), `px-6`, `border-b border-border`, `bg-secondary` (Charcoal nav surface). Three flex groups: left (title/breadcrumb), center (view tabs), right (toolbar buttons + CTA). Replaces the current `header` block in `kanban-board.tsx`.
- **FilterChipsBar:** `h-9` (36px), `px-6`, `border-b border-border`, `bg-background`. Shows active filter chips + `+ Add filter` button. Replaces the current always-on label filter bar (which becomes the chip source). Hidden when no filters active — instead the `+ Add filter` button lives in the header toolbar.
- **BoardBody:** `flex-1 overflow-x-auto bg-background`. Inner flex row `flex gap-4 h-full min-h-0 px-4 py-3`. Columns are fixed-width, the row scrolls horizontally. Replaces the current `ScrollArea`-wrapped board.

### 1.3 Column layout

- **Column width:** `w-[348px]` (matches Linear) — use arbitrary value. `shrink-0`.
- **Column gap:** `gap-4` (16px) between columns.
- **Column container:** `flex flex-col h-full rounded-lg border border-border bg-card/40`. Note: Linear columns are borderless on the canvas; we keep a subtle Graphite border per design.md's "border-defined edges" rule (design.md wins — see conflict register #2).
- **Column header:** `h-[50px] shrink-0 px-3 flex items-center gap-2 border-b border-border`. Status icon (14px) + name (`text-sm font-medium`) + count (`text-xs font-mono text-muted-foreground`) + spacer + `Open menu` icon button (16px, ghost). The `+ add task` and `delete` actions move into the column menu (DropdownMenu) — matches Linear's single `Open menu` per column.
- **Card list:** `flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[80px]`. Vertical scroll per column. This is the `Droppable`.
- **Empty column state:** centered `text-xs text-muted-foreground py-6` "No issues" + a faint `+` affordance on hover. Replaces the current inline-create-at-bottom pattern (which moves to a card-footer `+` row).

---

## 2. Component-by-Component Plan

### 2.1 App sidebar / nav — `sidebar-layout.tsx` (edit in place)

- **shadcn primitives:** `Tooltip`, `DropdownMenu`, `Button` (ghost/icon), `Collapsible` **(NEW — see gaps)**.
- **Props:** unchanged shell props `{ children }`.
- **Key changes:**
  - Width `w-64`/`w-14`.
  - Workspace header: keep avatar tile (`size-6 rounded-md bg-sidebar-primary`) + `TaskForge` name + chevron → wrap in `DropdownMenu` (workspace menu). Height `h-11` (44px) + `mt-2`.
  - Primary nav: rename/expand to `Inbox`, `My Issues`, `Pulse`, `Workspace`, `Initiatives`, `Projects`, `Views`, `More` as **ghost nav links** (`text-muted-foreground hover:text-foreground`, `px-3 py-1.5 text-sm`, `rounded-md`). Only `My Issues` routes today (`/tasks`); the rest are **placeholder links** (render as disabled-ish `text-muted-foreground/60 cursor-default` with tooltip "Coming soon") — **client-side only, no backend**. This matches Linear's nav vocabulary without inventing features.
  - `Favorites` section: `Collapsible` header (`text-xs font-medium uppercase tracking-wider text-muted-foreground` + chevron) + children. Seed with a single "Assigned to me" saved-view link (routes to `/tasks`). Empty state: muted hint.
  - `Your teams` → rename current `BOARDS` section to `BOARDS` (keep) but restructure each board row to support a nested `Collapsible` of `Issues`/`Projects`/`Views` children. **Scope cut:** for now keep boards as flat links (the nested team→issues/projects/views hierarchy needs backend team concept we don't have). Add a `+` button (create board) at section header right.
  - Active board link: keep the `absolute left-0 w-0.5 bg-primary` lime indicator bar — **this is the one rationed Lime use on the sidebar** (active nav state, permitted by design.md "selected navigation states"). Do NOT add lime elsewhere in sidebar.
  - Bottom: `Settings` + profile `DropdownMenu` (Account/Sign Out) + collapse toggle. Unchanged.
- **Replaces:** the current `sidebar-layout.tsx` nav body (keep shell + collapse logic).
- **Styling tokens:** `bg-sidebar-background`, `border-sidebar-border`, `text-muted-foreground`, `bg-sidebar-accent`, `bg-primary` (active bar only).

### 2.2 Board header bar — `board-header-bar.tsx` (NEW)

- **shadcn primitives:** `Button` (ghost/icon for toolbar), `ToggleGroup`+`ToggleGroupItem` (view tabs) — or `Tabs`/`TabsList`/`TabsTrigger`. Prefer **`ToggleGroup`** (already used for view mode) to avoid adding tab-routing semantics. **[NON-BLOCKING]** `Tabs` is also installed; pick whichever matches the existing view-toggle pattern — keep it consistent with current code which uses `ToggleGroup`.
- **Props:** `{ board: Board; viewMode; onViewModeChange; onOpenFilters; onOpenDisplay; onNewTask }`.
- **Layout:** `flex h-12 items-center justify-between px-6 border-b border-border bg-secondary shrink-0`.
  - Left: `ChevronRight`-separated breadcrumb — `board.name` (no team/workspace concept yet). `text-sm font-medium text-foreground`. Drop the back `ArrowLeft` button (sidebar nav replaces it). Drop `board.description` from header (move to board settings / a tooltip).
  - Center: `ToggleGroup type="single"` with `List` + `Kanban` items (keep current icons `List`/`Columns3`). `variant="ghost"`, `size="sm"`, compact.
  - Right: toolbar icon buttons (`Button variant="ghost" size="icon" className="size-7"`): `Filter` (lucide `Filter`/`SlidersHorizontal`) → `Display` (lucide `SlidersHorizontal` or `Settings2`) → board settings (lucide `Settings`, routes to `/board/:id/settings`) → **`New Issue` CTA** = `Button size="sm"` with lucide `Plus` + "New Issue", **default variant (Lime fill)**. This is the screen's single primary CTA.
- **Replaces:** the `header` block (lines ~145-175) in `kanban-board.tsx`.
- **Styling:** toolbar icons `text-muted-foreground hover:text-foreground`. CTA = `bg-primary text-primary-foreground` (Lime). No lime on anything else in the header.

### 2.3 Filter chips bar — `filter-chips-bar.tsx` (NEW)

- **shadcn primitives:** `Button` (ghost icon for `+ Add filter`), `Popover` (filter picker), `Badge` (active chips).
- **Props:** `{ activeFilters: FilterState; onRemove: (key) => void; onClear: () => void; labels: Label[] }`.
- **Layout:** `flex h-9 items-center gap-2 px-6 border-b border-border bg-background shrink-0`. Each active filter = a `Badge variant="outline"` chip with `×` remove. `+ Add filter` ghost button opens a `Popover` with label list (checkboxes). `Clear all` ghost button at right when filters exist.
- **Replaces:** the current always-on label filter bar (lines ~178-201). The label-pill-as-toggle row is removed; labels become filter chips here.
- **Filter state:** `{ labelIds: string[] }` for now. Extensible but keep minimal.
- **Styling:** chips `border-border text-muted-foreground rounded-sm px-2 py-0.5 text-xs`. `+ Add filter` `text-muted-foreground text-xs`.

### 2.4 Column container + header — `board-column.tsx` (NEW)

- **shadcn primitives:** `DropdownMenu` (column menu), `Button` (ghost icon).
- **Props:** `{ list: List; tasks: Task[]; onAddTask; onDeleteList; children (card list) }`.
- **Layout:** `flex flex-col w-[348px] shrink-0 h-full rounded-lg border border-border bg-card/40`.
  - Header: `h-[50px] shrink-0 px-3 flex items-center gap-2 border-b border-border`. Status dot/icon (use `list.color` rendered as a 14px circle — keep current `size-2.5 rounded-full` but bump to `size-3.5` to match Linear's 14px) + `span.text-sm font-medium` name + `span.text-xs font-mono text-muted-foreground` count + spacer + `DropdownMenu` trigger (`Button variant="ghost" size="icon" className="size-6"` with `MoreHorizontal` icon). Menu items: `Add task`, `Edit list` (out of scope — link to settings), `Delete list` (destructive).
  - Body: `div.flex-1.overflow-y-auto.p-2.space-y-1.5.min-h-[80px]` — this is the `Droppable` target (DnD wrapper stays in `kanban-board.tsx`, see §6).
  - Footer: `+` row — `button.flex.items-center.gap-2.px-2.py-1.5.text-xs.text-muted-foreground.hover:text-foreground.hover:bg-accent.rounded-sm.w-full` with `Plus` icon + "New issue". Clicking opens inline `CreateTaskModal` (keep) or focuses a quick-add input. Replaces the current `creatingInList` inline block (move it into this footer slot).
  - Empty state: when `tasks.length === 0`, render `div.text-center.text-xs.text-muted-foreground.py-6` "No issues" above the `+` footer.
- **Replaces:** the inline column JSX (lines ~258-358) in `kanban-board.tsx`.
- **Styling:** `bg-card/40` (semi Obsidian — design.md says no bright fills; 40% opacity over Onyx canvas reads as a quiet panel). Border `border-border` (Graphite). Hover-drag-over: `bg-accent/30` (not lime).

### 2.5 Task card — `task-card.tsx` (REWRITE)

This is the biggest change. Linear cards are **single-row, compact, horizontal**, not tall stacked cards.

- **shadcn primitives:** `Badge` (priority/labels), `Avatar`/`AvatarFallback` (assignee), `Tooltip` (hover details). Keep custom SVG priority icons (they're already design.md-compliant).
- **Props:** `{ task; isDragging?; boardId?; parentTaskNumber?; onAddSubTask? }` (add `onAddSubTask` callback so the hover `+` lives on the card, not a wrapper).
- **New layout (single row, two lines max):**
  ```
  ┌──────────────────────────────────────────────────────────┐
  │ [priority-icon] TF-730  Task title here…        [avatar] │
  │ ↳ TF-729  [label] [label] +2   💬3  ⊘2            [tag+] │
  └──────────────────────────────────────────────────────────┘
  ```
  - Container: `group/card flex flex-col gap-1 rounded-md border border-border bg-card p-2.5 cursor-pointer transition-colors hover:border-foreground/20 hover:bg-accent/30`. **Drop the `shadow-sm`/`shadow-md`** — design.md cards use inset border + soft shadow, but at this compact density the border alone reads cleaner; keep `shadow-sm` only when `isDragging` (`shadow-xl rotate-1`).
  - **Row 1:** `flex items-center gap-2 min-w-0`.
    - Priority icon (14px, current SVGs, keep color mapping: urgent/high → `text-[#eb5757]` Crimson, medium → `text-[#5e6ad2]` Indigo, low → `text-muted-foreground`). **[NON-BLOCKING]** design.md says Crimson/Emerald are "outline accents, not status colors" — but priority is a semantic signal, and the current mapping already uses Crimson/Indigo. Keep it; this is an accepted existing deviation.
    - `taskNumber`: `span.text-xs.font-mono.text-muted-foreground.shrink-0` (JetBrains Mono per design.md).
    - Title: `span.text-sm.text-foreground.truncate.flex-1` (weight 400, not 510 — design.md caps at 590; use `font-medium` = 500 only if 400 reads too weak at this size — **[NON-BLOCKING]** try 400 first).
    - Assignee avatar: `Avatar className="size-5 border-border"` with `AvatarFallback` initial. Right-aligned (`ml-auto shrink-0`). 20px (Linear uses 18px; 20px = `size-5` is our nearest token step).
  - **Row 2 (only if any metadata exists):** `flex items-center gap-1.5 text-muted-foreground text-xs min-w-0`.
    - Parent ref: `span.font-mono.text-[10px].text-muted-foreground/70.bg-muted.rounded.px-1` `↳ {parentTaskNumber}` (keep current).
    - Labels: keep current `visibleLabels.slice(0,2)` pills + `+N` overflow. Use `LabelPill` but at `text-[10px] px-1 py-0` (tighter).
    - Comments: current `CommentIcon` + count.
    - Blocked: current `BlockedIcon` + `blockedByCount` in `text-[#eb5757]`.
    - Label manager (`+` tag button): `opacity-0 group-hover/card:opacity-100` at far right (`ml-auto`).
- **Sub-task indent:** keep `isSubTask && "pl-4 border-l-2 border-l-border"` — matches Linear's parent-ref convention.
- **Hover/selection:** `hover:bg-accent/30 hover:border-foreground/20`. No lime. Clicking navigates to detail (unchanged).
- **Replaces:** the entire current `task-card.tsx` body.
- **DnD:** the `Draggable` wrapper stays in `kanban-board.tsx` (see §6). `TaskCard` itself is presentational; `onAddSubTask` is wired from the parent.

### 2.6 Card badges (sub-components of `task-card.tsx`)

Keep inline in `task-card.tsx` (no new files — they're single-use):

- **Status:** N/A on card (status is the column). Skip.
- **Priority:** existing `PriorityUrgentIcon`/`High`/`Medium`/`Low` SVGs. Keep.
- **Labels:** `LabelPill` (existing) at compact size.
- **Assignee:** `Avatar` + `AvatarFallback` (shadcn).
- **Blocked:** existing `BlockedIcon` + Crimson text.
- **Sub-task parent:** existing `↳ {parentTaskNumber}` badge.
- **Task number:** mono span.

### 2.7 Create-task entry point

- **Header CTA** (`New Issue` in `board-header-bar.tsx`): opens a `Dialog` (shadcn `Dialog`, already installed) with a proper title input + list selector (`Select`) + priority selector. **Replaces** the current inline `CreateTaskModal` for the header entry point. New file `create-task-dialog.tsx`.
- **Column `+` footer:** keeps the inline quick-add (`CreateTaskModal` — refactor to a single-line input that submits on Enter, no Add/Cancel buttons; blur cancels). This is the fast path.
- **Card hover `+` (sub-task):** keeps `CreateTaskModal` in the current sub-task modal overlay (lines ~401-413) — but swap the ad-hoc `fixed inset-0` overlay for a shadcn `Dialog`.

### 2.8 `create-task-dialog.tsx` (NEW)

- **shadcn primitives:** `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Input`, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, `Button`, `Label`.
- **Props:** `{ open; onOpenChange; boardId; lists: List[]; defaultListId? }`.
- **Fields:** title (`Input`, autofocus, Enter submits), list (`Select`), priority (`Select`: low/medium/high/urgent). No description here (keep fast).
- **Styling:** `DialogContent` default (Charcoal popover). Submit button = Lime `Button` (this is the modal's primary CTA — permitted; the modal is a focused conversion moment, and the header CTA is the *page's* CTA. **[NON-BLOCKING]** if this feels like two lime CTAs on one screen, make the dialog submit button `variant="default"` lime and the header CTA `variant="outline"` — but design.md says one lime CTA *per screen*, and a modal is arguably a second screen. Default: lime in dialog.)

---

## 3. shadcn Component Gaps

Components needed but **not** currently installed:

| Component | Why | Install |
|---|---|---|
| `collapsible` | Sidebar `Favorites`/`BOARDS` collapsible sections (replaces the ad-hoc `boardsCollapsed` state + chevron) | `npx shadcn@latest add collapsible` |

Everything else is already installed: `dialog`, `select`, `dropdown-menu`, `popover`, `badge`, `avatar`, `tooltip`, `toggle-group`, `button`, `input`, `scroll-area`, `separator`, `tabs`.

**Do not add:** `command`, `combobox`, `calendar`, `date-picker` — out of scope (no due-date picker in this refactor).

---

## 4. Design.md Conflict Register

| # | What Linear does | What design.md requires | Resolution |
|---|---|---|---|
| 1 | View tabs use an active **filled light-gray pill** (`data-active` styled) | One Lime CTA per screen; nav active states use Lime *or* muted accent | Active view tab = `bg-accent text-foreground` (Graphite), **not** Lime. Lime reserved for `New Issue` CTA only. |
| 2 | Board columns are **borderless** on the canvas (separated by whitespace only) | Cards/panels get depth from 1px inset Graphite border + soft shadow, not fills | Keep `border border-border` on columns (design.md wins). Linear's borderless look relies on a lighter canvas; our Onyx needs the edge definition. |
| 3 | Linear status icons use a **dashed progress ring** with `#e2e2e2` stroke | No new accent colors; palette is Lime + Indigo + semantic only | Status dot = `list.color` (user-defined, already supported). For the ring icon, use `text-muted-foreground` stroke, not `#e2e2e2`. |
| 4 | Linear issue IDs use **Berkeley Mono** | JetBrains Mono (`--font-mono`) is the substitute | Use `font-mono` (already wired to JetBrains Mono in `index.css`). |
| 5 | Linear uses **Inter Variable weight 510** for titles | Weights cap at 590; 510 is allowed | Use `font-medium` (500) for titles — 510 isn't a Tailwind step. Acceptable per design.md (cap is a maximum, not a requirement). |
| 6 | Linear `Create new issue` is an **icon-only** button in the sidebar header | One filled Lime CTA per screen | Put the Lime `New Issue` CTA in the **board header** (text + icon), not the sidebar. The sidebar's `Create new issue` becomes a ghost icon (no lime). |
| 7 | Linear cards have **no visible border** (subtle bg shift on hover) | No bright fills; border-defined edges | Cards keep `border border-border` + `hover:border-foreground/20`. design.md wins. |
| 8 | Linear column count is a plain number | Mono for IDs/numbers | Count = `font-mono text-xs text-muted-foreground`. Compliant. |
| 9 | Linear uses `lch()` colors throughout | design.md tokens are hex | Use our hex tokens (`--color-*` / Tailwind `text-*`/`bg-*`). Never paste `lch()` values. |
| 10 | Linear sidebar nav has `Inbox`/`Pulse`/`Initiatives`/`Projects`/`Views` as real features | We have no backend for these | Render as disabled placeholder links (muted, tooltip "Coming soon"). Don't build backend. |

---

## 5. Data / Hook Changes

**Minimal — no backend work.**

- **New hook: `use-board-view-state.ts`** (client-only): manages `viewMode` ('kanban'|'list'), `filterState` ({ labelIds: string[] }), `groupBy` (hardcoded 'status'/'list' for now — no UI control yet, out of scope). Persists to `localStorage` per board via `use-settings.ts` pattern. Keeps the board component clean.
- **No new API calls.** All data comes from existing `useBoardFull` (`boards/:id/full` returns lists+tasks+labels+members).
- **Type changes:** none. `Task`/`List`/`Board`/`Label` already cover everything. `FilterState` is a new local type in `use-board-view-state.ts`.
- **`useSocket`:** unchanged — still invalidates on WS events.
- **Out of scope (client-only for now):** saved views, group-by-priority, group-by-assignee, search-within-board, due-date filtering. The `Display options` button renders a `Popover` with **density toggle only** (compact/default — client-only, adjusts card padding) as a minimal placeholder; everything else in the popover is "Coming soon".

---

## 6. Out of Scope

- **Task detail page** (`task-detail-page.tsx`) — untouched.
- **MCP / REST API / Prisma schema** — no changes.
- **Drag-and-drop mechanics** — `@hello-pangea/dnd` `DragDropContext`/`Droppable`/`Draggable` stay. The `DragDropContext` remains at the `kanban-board.tsx` top level; `Droppable` wraps each `BoardColumn` body; `Draggable` wraps each `TaskCard`. Only the *visual* wrappers move — DnD logic (`handleDragEnd`, reorder/move API calls) is unchanged.
- **Board settings page** — untouched.
- **Auth/onboarding pages** — untouched.
- **List edit/create UX beyond the column menu** — no inline rename; editing lists stays in board settings.
- **Saved views, advanced filters (assignee/priority/status/due), group-by controls** — placeholder UI only.
- **List view** (`viewMode === 'list'`) — keep the existing table as-is; only minor token compliance pass (it already uses tokens). Not a rewrite target.
- **Real avatars (images)** — keep initial-letter fallbacks; no image upload.

---

## 7. Implementation Order

Each step ends with a verification gate: `pnpm --filter @taskforge/web test` (Vitest) + `pnpm --filter @taskforge/web build` (tsc + vite). Paste output.

### Step 0 — Install missing primitive
- `npx shadcn@latest add collapsapsible` (in `apps/web`).
- Verify: `ls apps/web/src/components/ui/collapsible.tsx`.

### Step 1 — Sidebar restructure (`sidebar-layout.tsx`)
- Add `Collapsible` for `BOARDS` section (replace `boardsCollapsed` state).
- Add primary nav placeholders (`Inbox`/`Pulse`/`Workspace`/`Initiatives`/`Projects`/`Views`/`More`) as disabled ghost links with tooltips.
- Add `Favorites` collapsible section with "Assigned to me" link.
- Width `w-64`/`w-14`. Workspace header `h-11 mt-2`.
- Keep active-board lime indicator bar.
- **Gate:** build + `sidebar-layout.test.tsx` (update if it asserts on the old nav structure).

### Step 2 — Extract `board-header-bar.tsx`
- New component. Wire into `kanban-board.tsx` replacing the `header` block.
- Move `viewMode` state into `use-board-view-state.ts`; header consumes it.
- `New Issue` CTA opens `create-task-dialog.tsx` (stub for now — wire in Step 5).
- **Gate:** build + tests.

### Step 3 — Extract `filter-chips-bar.tsx` + `use-board-view-state.ts`
- Move `activeLabelIds` state into the view-state hook.
- Replace the always-on label-pill bar with conditional `FilterChipsBar`.
- `+ Add filter` popover with label checkboxes.
- **Gate:** build + tests.

### Step 4 — Extract `board-column.tsx`
- Move column JSX out of `kanban-board.tsx`.
- Column menu (`DropdownMenu`) with Add/Delete.
- `+` footer with inline quick-add (`CreateTaskModal` refactored to single-line).
- Empty state.
- Keep `Droppable` wrapper in `kanban-board.tsx` around `BoardColumn`'s card-list div (pass `provided`/`snapshot` via props or render-prop — simplest: `BoardColumn` accepts `droppableProvided` + `isDraggingOver` props).
- Column width `w-[348px]`, header `h-[50px]`.
- **Gate:** build + tests + manual DnD check.

### Step 5 — Rewrite `task-card.tsx`
- Single-row compact layout per §2.5.
- Move sub-task `+` onto the card via `onAddSubTask` prop.
- Use `Avatar`/`AvatarFallback` for assignee.
- Keep priority SVGs, label pills, blocked icon, parent ref.
- **Gate:** build + tests. Verify no lime anywhere on the card.

### Step 6 — `create-task-dialog.tsx`
- Full dialog with title/list/priority selectors.
- Wire to `useCreateTask`.
- Replace the ad-hoc sub-task overlay with `Dialog`.
- **Gate:** build + tests.

### Step 7 — Token compliance sweep
- Grep for hardcoded hex colors in touched files (`rg '#[0-9a-fA-F]{6}' apps/web/src/components/{board-header-bar,board-column,task-card,filter-chips-bar,create-task-dialog}.tsx apps/web/src/components/sidebar-layout.tsx`). Replace with tokens unless it's an accepted deviation (priority Crimson/Indigo, label user-colors).
- Verify no `font-bold`/`font-extrabold` (weight >590) in new code.
- Verify no gradients.
- **Gate:** `pnpm --filter @taskforge/web lint` + build + full test suite.

### Step 8 — Final verification
- `pnpm --filter @taskforge/web build`
- `pnpm --filter @taskforge/web test`
- `pnpm --filter @taskforge/web lint`
- Paste all three outputs. Manual smoke test: create task via header CTA, via column `+`, drag between columns, filter by label, collapse sidebar, switch list/kanban.

---

## Open questions

- **[NON-BLOCKING]** Column width: 348px (Linear exact, arbitrary value) vs 320px (`w-80`, nearest Tailwind step). Plan defaults to 348px. If you prefer a token-aligned step, use `w-80` and note it.
- **[NON-BLOCKING]** Title weight 400 vs 500 at 14px on dark — try 400 first, bump to 500 only if it reads too weak.
- **[NON-BLOCKING]** `New Issue` CTA in dialog also Lime, or outline? Plan defaults Lime (modal = second screen).
- **[NON-BLOCKING]** View tabs: keep `ToggleGroup` (current) or switch to `Tabs`? Plan keeps `ToggleGroup` for consistency with existing code.