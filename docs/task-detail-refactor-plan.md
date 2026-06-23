# Task Detail Page Refactor Plan — Linear-Style

> Component-level refactor plan for `apps/web/src/pages/task-detail-page.tsx`.
> Reference: saved Linear task view in `docs/task-detail/` (HTML + CSS, obfuscated
> styled-components — structure inferred from aria-labels and visible text content).
> **design.md is the source of truth for all visual decisions.** Linear is the
> reference for structure, hierarchy, and interaction patterns only.

---

## 0. What Linear actually does (extracted from the saved view)

From the visible text + aria-labels, Linear's task detail page is:

```
┌─ Top bar (app nav, not part of detail) ─────────────────────────────────────┐
│  Kunduz  Inbox  My issues  Pulse …  [Search]  [+]  [bell]  [avatar]          │
├─ Breadcrumb row ────────────────────────────────────────────────────────────┤
│  Development › Issues › DEV-6 /backend-implement Add i18n…   2/669  [◁ ▷]   │
│   [back] [prev/next item] [issue options ⋯] [copy ID] [copy URL] [★]         │
├─ Main content column (scrolls) ──────────┬─ Right sidebar (properties) ────┤
│  [Urgent ●] DEV-6                          │  Properties                    │
│  /backend-implement Add i18n key fields…  │   Done        (status)         │
│  Sub-issue of KAI-267                      │   Urgent      (priority)       │
│                                            │   anil        (assignee)       │
│  [Description editor — ProseMirror]        │   Labels      [Backend][contract]│
│   …                                        │   Project     Add to project   │
│                                            │   Relations  Related (5)       │
│  Add sub-issues  (inline list of subs)     │                                │
│                                            │                                │
│  Activity (timeline)                       │                                │
│   anil created the issue · 6w ago          │                                │
│   …                                        │                                │
│   Show 6 events…                            │                                │
│                                            │                                │
│  [Comment composer — textarea + Submit]    │                                │
└────────────────────────────────────────────┴────────────────────────────────┘
```

Key Linear structural facts:
- **Two-column layout**: main content (flex-1, scrolls) + right properties sidebar (~240–280px, fixed, scrolls independently).
- **Breadcrumb row** sits above the title, separate from the title. Contains: team › project/list › `DEV-6` identifier + title, plus prev/next item count (`2/669`), and a row of icon actions (back, prev, next, options ⋯, copy ID, copy URL, favorite ★).
- **Title** is large, editable inline, sits below the breadcrumb. The task identifier (`DEV-6`) is NOT in the title — it's in the breadcrumb row, in mono.
- **Priority icon** sits to the LEFT of the title (Urgent ●), not in the sidebar only.
- **"Sub-issue of KAI-267"** appears as a small parent-reference line directly under the title.
- **Description** is a rich-text editor area (ProseMirror), no "Description" heading — it's just an editable region with placeholder.
- **Sub-issues** are an inline list in the main column with an "Add sub-issues" affordance — NOT in the sidebar.
- **Activity** is a timeline in the main column, with a "Show N events…" expander.
- **Comment composer** is at the bottom of the main column.
- **Right sidebar** is a flat list of property rows: Status, Priority, Assignee, Labels, Project, Relations. Each row is `label (muted, small) → value/control`. No card chrome around rows — they sit directly on the sidebar surface with hairline dividers between groups.
- **No tabs** in the detail view itself (Linear uses tabs on list views, not detail).

---

## 1. Layout structure (target)

### Shell

```
<div className="flex h-full flex-col bg-background">
  <DetailBreadcrumbBar />        // sticky, h-11, border-b
  <div className="flex flex-1 min-h-0">
    <DetailMainColumn />         // flex-1, ScrollArea, max-w-3xl
    <DetailPropertiesSidebar />  // w-[260px], border-l, ScrollArea
  </div>
</div>
```

- Page canvas: `bg-background` (Onyx `#08090a`).
- Main column: `bg-background`, max width `max-w-3xl` (consistent with current), `px-8 py-6`, `space-y-8` between major sections (design.md section gap is 80–120px; 8 = 32px is the intra-page rhythm — major sections separated by `space-y-8` ≈ 32px, which is the largest practical gap inside a scroll column).
- Right sidebar: `w-[260px] shrink-0 border-l border-border bg-secondary` (Charcoal `#0f1011`), independent `ScrollArea`.
- Both columns scroll independently. The breadcrumb bar is sticky and does not scroll.

### Top area — breadcrumb bar (replaces current header)

Current header crams back button + task number + editable title + prev/next into one row. Linear splits this into a **breadcrumb row** (identifier + nav actions) and lets the **title** live in the main column below.

New `detail-breadcrumb-bar.tsx`:
- Left: back chevron → breadcrumb text `Board name › List name › TF-730` (board name from `useBoardFull`, list name from `board.lists.find`). The current `task.taskNumber` in mono. Truncated with `truncate`.
- Center/right: prev/next item buttons (`ChevronLeft`/`ChevronRight`) + `2/669`-style position indicator (mono, muted) + an actions `DropdownMenu` (⋯) with Copy ID, Copy URL, Favorite (Favorite/Subscribe are out of scope functionally — see §6 — but the ⋯ menu can hold Copy ID/URL which are client-side).
- **No title here.** Title moves to main column.
- Height `h-11`, `px-6`, `border-b border-border`, `bg-secondary`.

### Main column order (top → bottom)

1. **Priority + Title block** (`detail-title-block.tsx`)
   - Priority icon (14×14, same SVG set as `task-card.tsx`) inline-left of title.
   - Title: `EditableTitle`, `text-[24px]` (`--text-heading-sm`), `font-medium` (weight 510), `tracking-tight` (`-0.264px`), `text-foreground`. Click-to-edit, Enter commits, Escape cancels (keep current behavior).
   - Parent reference line below title: `Sub-issue of TF-267` — mono task number + link, `text-xs text-muted-foreground`. Only rendered if `task.parent`.
2. **Description editor** (`detail-description-editor.tsx`)
   - No "Description" heading (Linear doesn't have one). Just the editable region.
   - Display: `text-sm text-foreground/90 leading-relaxed min-h-[60px]`, placeholder `Add a description…` in `text-muted-foreground italic`. Hover shows `bg-accent/30 rounded-md -mx-2 px-2` (subtle hover affordance, not a fill card).
   - Edit: `Textarea` (existing shadcn) `rows={8}`, with a small action row: `Save` (ghost/outline) + `Cancel` (ghost). **No Lime CTA here** — Save is a secondary action (design.md: one Lime CTA per screen; the screen's CTA is "New Issue" on the board, and the detail page has no primary creation action — comment submit is secondary).
3. **Sub-issues section** (`detail-sub-issues.tsx`)
   - Heading: `Sub-issues` + count badge, `text-xs font-medium text-muted-foreground uppercase tracking-wider` (matches existing pattern).
   - List: each row reuses the visual language of `task-card.tsx` (border-defined, `bg-card`, `rounded-md`, `border-border`, `px-3 py-2`, hover `bg-accent/30`). Mono task number + title + status pill.
   - "Add sub-issue" affordance: a ghost button row (`+ Add sub-issue`) that opens the existing `CreateTaskModal` inline (no full-screen modal — render `CreateTaskModal` directly in the list when adding).
4. **Relations section** (`detail-relations.tsx`)
   - Three groups: Blocking / Blocked by / Related — same as current `RelationGroup`, restyled.
   - Each group: heading row + entries. Entries are compact rows: mono task number + title + status pill + remove (×). "Add" uses a `Popover` with a searchable list (see §2) instead of the current `Select` (Select doesn't scale and feels heavy for "add a relation").
5. **Activity timeline** (`detail-activity.tsx`)
   - Heading: `Activity` with icon, same uppercase muted style.
   - Timeline rows: actor initial avatar (size-5, `bg-muted`, mono initial) + `actor action detail` + mono timestamp right-aligned. `text-sm`.
   - "Show N more events…" expander using `Collapsible` (existing shadcn) when `activity.length > 5`.
6. **Comments section** (`detail-comments.tsx`)
   - Heading: `Comments (N)`.
   - Composer at top: `Textarea` (auto-grow feel via `rows={2}`) + `Submit comment` button (ghost/outline, `size="sm"`). Enter submits, Shift+Enter newline.
   - Comment list: each comment is a row with author (weight 510) + mono timestamp + body (`text-sm text-foreground/90`). No card chrome — just `py-3 border-b border-border last:border-0` (Linear uses flat timeline, not cards).

### Right sidebar — properties panel (`detail-properties-sidebar.tsx`)

Flat list of property rows, no card chrome, hairline dividers between groups. Each row is `flex items-center justify-between gap-3 py-2` with a muted label left and a control/value right.

**Group 1 — Status & ownership** (top, no divider above):
- **Status** — `Select` (existing). Options: Active / Done / Archived. Render value with a status dot (Emerald for done, Slate for active, Fog for archived) inline in the trigger.
- **Priority** — `Select` (existing) replacing the current 4-button row. Options: Low / Medium / High / Urgent, each with the priority SVG icon prefix. Rationale: the current 4-button row uses Crimson/Indigo tinted fills (`bg-[#eb5757]/10`) which is a bright-fill pattern design.md discourages on chrome; a Select with icon-prefixed options is quieter and matches Linear.
- **Assignee** — `Select` (existing). Options: Unassigned + users. Show avatar initial in trigger.
- **Labels** — `LabelManager` (existing component) trigger + inline `LabelPill` list. Reuse `LabelManager`'s Popover. Empty state: `+ Add label` ghost button that opens the same popover.

**Divider** (`Separator`).

**Group 2 — Organization**:
- **List** — read-only value with `ListChecks` icon + list name. (Moving tasks between lists is done on the board via drag; detail page shows it read-only — matches Linear where the list/column is shown but not edited here.)
- **Parent** — if `task.parent`: link row (mono number + title, clickable). If no parent: `+ Set parent` opening a `Popover` with task search (reuse the relation-add pattern).
- **Sub-issues** — count + `N sub-issues` link that scrolls to the sub-issues section in the main column (anchor). Not a full list here — Linear keeps the list in the main column.

**Divider**.

**Group 3 — Relations summary**:
- **Blocking** — `N` count or `None`, clickable to scroll to relations section.
- **Blocked by** — `N` count or `None`.
- **Related** — `N` count or `None`.

**Divider**.

**Group 4 — Dates** (muted, mono):
- **Created** — `Clock` icon + mono timestamp.
- **Updated** — `Clock` icon + mono timestamp.
- **Due date** — if `task.dueDate`: `Calendar` icon + mono date. If none: omit (don't show empty).

---

## 2. Component-by-component plan

All new components live in `apps/web/src/components/` with kebab-case filenames. Each is a named export. All prefer existing shadcn primitives; custom is justified per item.

### 2.1 `detail-breadcrumb-bar.tsx` (NEW)

- **Primitive**: `Button` (ghost/icon), `DropdownMenu`, `Separator`.
- **Props**: `{ boardName: string; listName: string; taskNumber: string; boardId: string; taskId: string; prevTask?: {id:string}; nextTask?: {id:string}; position: { current: number; total: number }; onBack: () => void; onNavigateTask: (id:string) => void }`.
- **Key styling**: `header flex h-11 items-center justify-between px-6 border-b border-border bg-secondary shrink-0`. Breadcrumb text: `text-xs text-muted-foreground` with last segment `text-foreground`. Task number in `font-mono`. Position indicator `font-mono text-xs text-muted-foreground`.
- **Replaces**: the current `<header>` block (lines 371–414 of `task-detail-page.tsx`) — back button, task number, title, prev/next. Title moves out to `detail-title-block`.

### 2.2 `detail-title-block.tsx` (NEW)

- **Primitive**: none (custom inline editable input — same pattern as current `EditableTitle`, extracted).
- **Props**: `{ task: Task; onSaveTitle: (t: string) => void; onNavigateParent: (id: string) => void }`.
- **Key styling**: priority icon (reuse `task-card.tsx` SVG set — extract to `priority-icons.tsx` shared file) `size-3.5` inline-left. Title `h1 text-[24px] font-medium tracking-tight text-foreground`. Edit state: `input bg-input rounded-md border border-border px-2 py-1 -mx-2 outline-none focus-visible:ring-2 focus-visible:ring-ring w-full text-[24px] font-medium tracking-tight`. Parent line: `text-xs text-muted-foreground mt-1`, task number `font-mono`.
- **Replaces**: `EditableTitle` (lines 62–114) + the inline title render in the header.

### 2.3 `detail-description-editor.tsx` (NEW — extracted from `EditableDescription`)

- **Primitive**: `Textarea`, `Button` (outline/ghost).
- **Props**: `{ value: string; onSave: (v: string) => void }`.
- **Key styling**: display `text-sm text-foreground/90 leading-relaxed min-h-[60px] cursor-text hover:bg-accent/30 rounded-md -mx-2 px-2 py-1`. Placeholder `italic text-muted-foreground`. Edit: `Textarea rows={8}` + action row `flex gap-2 mt-2` with `Button size="sm" variant="outline"` (Save) and `Button size="sm" variant="ghost"` (Cancel). **No Lime.**
- **Replaces**: `EditableDescription` (lines 118–167) + the Description `<section>` (lines 429–437).

### 2.4 `detail-sub-issues.tsx` (NEW — extracted + restyled)

- **Primitive**: `Button` (ghost for add), `Badge` for status, `Collapsible` if list is long.
- **Props**: `{ task: Task; boardId: string; onNavigate: (id:string) => void; onCreateSubTask: (title:string) => void }`.
- **Key styling**: heading `text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5`. Rows reuse `task-card.tsx` row styling: `flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer hover:bg-accent/30`. Mono task number `text-xs font-mono text-muted-foreground`. Status `Badge variant="secondary" text-[10px]`. Add row: `Button variant="ghost" size="sm" text-muted-foreground hover:text-foreground` with `Plus size-3.5`. Inline `CreateTaskModal` renders in place of the add button when active.
- **Replaces**: Sub-tasks `<section>` (lines 442–476) + the sub-task modal overlay (lines 823–840).

### 2.5 `detail-relations.tsx` (NEW — extracted + restyled)

- **Primitive**: `Popover` (for add), `Button` (ghost icon for remove), `Input` (search inside popover), `Badge`.
- **Props**: `{ relations: TaskRelations; taskId: string; boardId: string; boardTasks: Task[]; onAdd: (otherTaskId, type, direction?) => void; onRemove: (relationId) => void; onNavigate: (id) => void }`.
- **Key styling**: three groups, each `space-y-1.5`. Heading `text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5`. Entry rows: same border-defined card row as sub-issues. Add control: `Popover` with `Input` search + filtered list of `boardTasks` (click to add). This replaces the current `Select`-based add (Select is awkward for "add a relation" — no search, full-height dropdown). **Justification for Popover over Select**: Select doesn't support search/filtering; relation lists can be long; Linear uses a searchable popover.
- **Replaces**: `RelationGroup` (lines 176–266) + the relations block in the sidebar (lines 733–806).

### 2.6 `detail-activity.tsx` (NEW — extracted + restyled)

- **Primitive**: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`.
- **Props**: `{ activity: Activity[] }`.
- **Key styling**: heading same uppercase muted pattern with `Activity` icon. Rows: `flex items-start gap-2 py-2 border-b border-border last:border-0`. Avatar `size-5 rounded-full bg-muted flex items-center justify-center` with `text-[10px] font-semibold text-muted-foreground` initial. Body `text-sm`: `actor` in `font-medium text-foreground`, action+detail in `text-muted-foreground`, timestamp in `font-mono text-xs text-muted-foreground ml-2`. Expander: `Collapsible` wrapping rows 5+ with trigger `Show N more events…` as `text-xs text-muted-foreground hover:text-foreground`.
- **Replaces**: Activity `<section>` (lines 481–521).

### 2.7 `detail-comments.tsx` (NEW — extracted + restyled)

- **Primitive**: `Textarea`, `Button` (outline/ghost), `Avatar`/`AvatarFallback`.
- **Props**: `{ comments: Comment[]; onSubmit: (body: string) => void }`.
- **Key styling**: heading `Comments (N)` uppercase muted. Composer: `Textarea rows={2}` + `Button size="sm" variant="outline"` (Submit — **not Lime**). Comment rows: `py-3 border-b border-border last:border-0`. Author `text-sm font-medium text-foreground`, timestamp `text-xs font-mono text-muted-foreground ml-2`, body `text-sm text-foreground/90 mt-1`. **No card chrome** (Linear uses flat timeline).
- **Replaces**: Comments `<section>` (lines 526–559).

### 2.8 `detail-properties-sidebar.tsx` (NEW — replaces the entire `<aside>`)

- **Primitive**: `Select`, `Separator`, `Popover` (for parent/labels), `Avatar`/`AvatarFallback`, `LabelManager` (existing), `LabelPill` (existing), `Button` (ghost).
- **Props**: `{ task: Task; board: Board; users: User[]; boardTasks: Task[]; onUpdate: (data: Partial<Task>) => void; onSetParent: (parentId: string | null) => void; onNavigate: (id: string) => void; onScrollTo: (anchor: string) => void }`.
- **Key styling**: `aside w-[260px] shrink-0 border-l border-border bg-secondary`. Inner `ScrollArea` with `p-4 space-y-1`. Property row: `flex items-center justify-between gap-3 py-2`. Label: `text-xs text-muted-foreground` (NOT uppercase — Linear uses sentence case in the sidebar; uppercase is reserved for section headings in the main column). Value/control right-aligned. Group dividers: `<Separator />` between groups.
- **Replaces**: the entire `<aside>` (lines 565–820).

### 2.9 `detail-property-row.tsx` (NEW — small helper)

- **Primitive**: none (trivial layout wrapper).
- **Props**: `{ label: string; children: ReactNode; onClick?: () => void }`.
- **Key styling**: `flex items-center justify-between gap-3 py-2 group`. Label `text-xs text-muted-foreground`. Value wrapper `flex items-center gap-1.5 text-sm text-foreground`. Hover: optional `hover:bg-accent/30 -mx-2 px-2 rounded` if `onClick` (clickable rows like Parent/Sub-issues count).
- **Rationale**: avoids repeating the row layout 8 times; keeps the sidebar file readable.

### 2.10 `detail-status-select.tsx` (NEW — thin wrapper around Select)

- **Primitive**: `Select`.
- **Props**: `{ value: Task['status']; onChange: (v) => void }`.
- **Key styling**: `SelectTrigger h-8` (compact, sidebar-appropriate). Trigger shows a status dot (Emerald `#27a644` for done, Slate `#62666d` for active, Fog `#8a8f98` for archived) + label. Options carry the same dot.
- **Why custom over bare Select**: the status dot needs to render inside the trigger value, which bare `SelectValue` doesn't do cleanly.

### 2.11 `detail-priority-select.tsx` (NEW — replaces the 4-button priority row)

- **Primitive**: `Select`.
- **Props**: `{ value: Task['priority']; onChange: (v) => void }`.
- **Key styling**: `SelectTrigger h-8`. Trigger shows priority SVG icon (from shared `priority-icons.tsx`) + label. Options: Low (Slate icon), Medium (Indigo icon), High (Crimson icon), Urgent (Crimson icon). **No tinted fills** — icons only carry color, the row stays monochrome.
- **Replaces**: the priority 4-button row (lines 588–615). **Justification**: current row uses `bg-[#eb5757]/10 text-[#eb5757]` tinted fills which is a bright-fill pattern; a Select is quieter and matches Linear's single-row property.

### 2.12 `detail-assignee-select.tsx` (NEW — thin wrapper)

- **Primitive**: `Select`, `Avatar`/`AvatarFallback`.
- **Props**: `{ value: string | null; users: User[]; onChange: (id: string | null) => void }`.
- **Key styling**: `SelectTrigger h-8`. Trigger shows `Avatar size-5` with initial (or `+` placeholder when unassigned) + name. Options show avatar + name.

### 2.13 `priority-icons.tsx` (NEW — shared)

- Extract the four priority SVG components from `task-card.tsx` (`PriorityUrgentIcon`, `PriorityHighIcon`, `PriorityMediumIcon`, `PriorityLowIcon`) into `components/priority-icons.tsx`. Export named. `task-card.tsx` imports from here. `detail-title-block` and `detail-priority-select` import from here.
- **Rationale**: single source for priority iconography; avoids duplication between board card and detail view.

### 2.14 `detail-add-relation-popover.tsx` (NEW — used by §2.5)

- **Primitive**: `Popover`, `Input`.
- **Props**: `{ boardTasks: Task[]; excludeIds: Set<string>; onAdd: (id: string) => void }`.
- **Key styling**: `PopoverContent w-64 p-0`. Search `Input` at top. List `max-h-48 overflow-y-auto` of filtered tasks, each row `flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent cursor-pointer` with mono task number + title.

### 2.15 `detail-add-parent-popover.tsx` (NEW — used by §2.8)

- Same pattern as §2.14 but for parent selection. `onAdd(id)` calls `onUpdate({ parentId: id })`. Filters out self, tasks that already have a parent, and tasks that are sub-tasks of this task (prevent cycles — matches current logic at lines 716–726).

### 2.16 Page file `task-detail-page.tsx` (REWRITE)

- Becomes a thin orchestrator: data hooks + layout composition. Imports the components above. No inline sub-components, no inline styling beyond layout.
- Keeps: `useTask`, `useBoardFull`, `useComments`, `useUsers`, `useLabels`, `useTasksByBoard`, `useTaskRelations`, `useUpdateTask`, `useCreateComment`, `useCreateRelation`, `useRemoveRelation`, `useCreateTask`, prev/next navigation logic, `handleUpdate`, `handleAddComment`.
- Adds: anchor scroll for sidebar → main section links (use `id` attributes on sections + `scrollIntoView`).

---

## 3. shadcn component gaps

**Currently installed** (21): tabs, label, scroll-area, popover, card, switch, tooltip, sonner, toggle-group, avatar, dialog, input, textarea, select, dropdown-menu, collapsible, toggle, button, separator, table, badge.

**Needed by this plan**: `Select`, `Popover`, `DropdownMenu`, `Collapsible`, `Separator`, `Button`, `Input`, `Textarea`, `Avatar`, `ScrollArea`, `Tooltip` (for icon buttons), `Badge` — **all already installed.**

**New shadcn components to add**: **none.** The plan is fully covered by the installed set. (A `Command`/`combobox` primitive would be nicer for the relation/parent search popovers, but `Popover` + `Input` + filtered list is sufficient and avoids adding `command` which pulls in `cmdk`. If the coder wants the nicer searchable list, optional: `npx shadcn@latest add command` — but it's NOT required.)

---

## 4. design.md conflict register

Linear's saved view vs design.md. **design.md wins every conflict.**

| # | Where | Linear does | design.md requires | Resolution |
|---|-------|-------------|--------------------|------------|
| 1 | Priority indicator | Crimson `#eb5757` filled dots/tints on buttons (`bg-[#eb5757]/10`) | No bright fills on chrome; Crimson is an outline accent only | Priority shown as a **monochrome SVG icon** with Crimson/Indigo stroke color only — no tinted background fills. The 4-button priority row becomes a `Select` with icon-prefixed options. |
| 2 | Status colors | Linear uses a palette of status colors (blue, purple, etc.) | Palette is Lime + Indigo + Emerald/Crimson/Cyan only — no new accent colors | Status dot uses only Emerald (done), Slate (active), Fog (archived). No blue/purple. |
| 3 | Card fills | Linear issue rows use subtle elevated fills | No bright fills on cards — Obsidian/Charcoal with 1px Graphite inset border + soft drop shadow | All rows use `bg-card` (Obsidian) + `border-border` (Graphite) + `rounded-md`. Depth from border, not fill. |
| 4 | Gradients | Linear uses subtle gradients on some surfaces | No gradients on UI surfaces | Flat colors only. |
| 5 | Font weight | Linear uses weight 510/590 | Inter weights cap at 590, never 700+ | Use `font-medium` (510) for emphasis, `font-semibold` (590) sparingly for avatars/author names. Never `font-bold`. |
| 6 | Primary CTA | Linear's detail page has no single obvious Lime CTA (the "Submit comment" is a subtle button) | One rationed Acid Lime CTA per screen, never decorative | The detail page has **no Lime CTA** — there is no primary creation action on the detail view. Save/Submit buttons use `variant="outline"` or `variant="ghost"`. Lime is reserved for the board's "New Issue" button. This is compliant: "one CTA per screen" and the detail screen's primary action is navigation/edit, not creation. |
| 7 | Borders on hover | Linear highlights rows with colored borders on hover | Border-defined edges; no colored hover borders | Hover uses `bg-accent/30` (Graphite) — no border color change to a chromatic color. Current `hover:border-foreground/20` on task-card is acceptable (monochrome). |
| 8 | Mono font | Linear uses Berkeley Mono | JetBrains Mono is the substitute | Use `font-mono` (already mapped to JetBrains Mono in `index.css`). |
| 9 | Property row labels | Linear uses sentence-case labels in the sidebar | design.md doesn't mandate case for sidebar labels; uppercase tracking-wider is for section headings | Sidebar property labels: `text-xs text-muted-foreground` sentence case (e.g. "Status", "Assignee"). Main-column section headings: `uppercase tracking-wider`. |
| 10 | Sidebar background | Linear sidebar is the same canvas as content | Sidebar uses `bg-secondary` (Charcoal) per existing tokens | Right sidebar `bg-secondary` `border-l border-border` — matches the board header bar pattern. |
| 11 | Comment cards | Linear renders comments as flat timeline rows | design.md: no bright fills; border-defined cards are allowed but flat is fine | Comments as flat rows with `border-b border-border` — no card chrome. Matches Linear and is quieter. |
| 12 | Section heading weight | Linear uses weight 510 for small headings | Inter 510 for UI emphasis | `font-medium` on all section headings. |

---

## 5. Data / hook changes

**No new hooks. No API changes. No type changes.** The refactor is purely presentational.

What's reused as-is:
- `useTask`, `useBoardFull`, `useComments`, `useUsers`, `useLabels`, `useTasksByBoard`, `useTaskRelations` — reads.
- `useUpdateTask`, `useCreateComment`, `useCreateRelation`, `useRemoveRelation`, `useCreateTask` — writes.
- `api.tasks.update` already accepts `Partial<Task>` including `status`, `priority`, `assigneeId`, `parentId`, `title`, `description`, `dueDate`. No new fields.
- `TaskRelations` type already has `blocking`, `blockedBy`, `relatedTo`.

Client-side only / out of scope (no data work):
- **Copy ID / Copy URL** in the breadcrumb ⋯ menu — client-side `navigator.clipboard.writeText`. No API.
- **Subscribe / Favorite** actions (Linear has them) — **out of scope**, no backend. The ⋯ menu will omit these.
- **Project** property (Linear shows "Project: Add to project") — **out of scope**, TaskForge has no projects. Omit from sidebar.
- **Reactions on comments** (Linear has "Add reaction") — **out of scope**.
- **Rich-text editor** (Linear uses ProseMirror) — **out of scope**; description stays a plain `Textarea`.
- **Real avatars** — **out of scope**; keep `AvatarFallback` initials.
- **Mentions / issue references in description** — **out of scope**.

---

## 6. Out of scope

- API, MCP, Prisma schema, backend.
- The board page (`kanban-board.tsx`, `board-column.tsx`, `board-header-bar.tsx`) — not touched. (Only `task-card.tsx` is touched to extract `priority-icons.tsx`.)
- Real rich-text editor (ProseMirror/Lexical). Description stays plain textarea.
- Real user avatars (image upload). Initials only.
- Comment reactions, editing, threading.
- Subscriptions / notifications / favorites / "watch" — no backend.
- Projects, cycles, milestones, triage — no backend.
- Git/development integration (Linear's "Development" section) — no backend.
- Keyboard shortcuts beyond Enter/Escape on inputs (Linear has extensive shortcuts).
- Drag-to-reorder sub-issues / relations.
- Inline status change from breadcrumb.
- Activity feed filtering / "Expand all activity" beyond the simple Collapsible expander.

---

## 7. Implementation order (for the coder)

Each step ends with a verification gate: `pnpm --filter @taskforge/web exec tsc --noEmit` (typecheck) + `pnpm --filter @taskforge/web exec eslint src` (lint). Run both before moving on. Tests at the end.

### Step 1 — Extract shared priority icons
- Create `components/priority-icons.tsx` with the 4 SVG components from `task-card.tsx`.
- Update `task-card.tsx` to import from `priority-icons.tsx`.
- **Verify**: typecheck + lint + `pnpm --filter @taskforge/web test` (existing tests pass).

### Step 2 — Sidebar property components
- Create `detail-status-select.tsx`, `detail-priority-select.tsx`, `detail-assignee-select.tsx`, `detail-property-row.tsx`.
- These are leaf components with no page dependencies — easy to verify in isolation.
- **Verify**: typecheck + lint.

### Step 3 — Add-relation / add-parent popovers
- Create `detail-add-relation-popover.tsx`, `detail-add-parent-popover.tsx`.
- **Verify**: typecheck + lint.

### Step 4 — Main column sections
- Create `detail-title-block.tsx`, `detail-description-editor.tsx`, `detail-sub-issues.tsx`, `detail-relations.tsx`, `detail-activity.tsx`, `detail-comments.tsx`.
- Each is self-contained, takes props, renders. No page wiring yet.
- **Verify**: typecheck + lint.

### Step 5 — Breadcrumb bar
- Create `detail-breadcrumb-bar.tsx`.
- **Verify**: typecheck + lint.

### Step 6 — Properties sidebar
- Create `detail-properties-sidebar.tsx` composing the Step 2 components + `LabelManager` + `LabelPill` + `Separator`.
- **Verify**: typecheck + lint.

### Step 7 — Rewrite `task-detail-page.tsx`
- Replace the 843-line file with the thin orchestrator composing Steps 4–6.
- Wire all hooks and handlers.
- Add `id` attributes to main-column sections for sidebar anchor links; wire `onScrollTo` via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })`.
- **Verify**: typecheck + lint + manual smoke (run `pnpm dev`, open a task, edit title/description/status/priority/assignee/labels, add a comment, add/remove a relation, add a sub-task, navigate prev/next).

### Step 8 — Tests
- The existing web tests are API-client tests (`api.test.ts`) and a socket test — they don't cover the detail page. No component tests exist in the repo (per AGENTS.md: "No component tests (`.test.tsx`) exist yet").
- **Do not add component tests in this refactor** — out of scope per §6 and the repo has no component test harness. If the coder wants to, optional: add a `task-detail-page.test.tsx` mocking hooks with `vi.mock` and asserting sections render. Mark as optional.
- **Verify**: `pnpm --filter @taskforge/web test` passes (existing tests unaffected).

### Final verification gate
- `pnpm --filter @taskforge/web exec tsc --noEmit` — paste last 15 lines.
- `pnpm --filter @taskforge/web exec eslint src` — paste last 15 lines.
- `pnpm --filter @taskforge/web test` — paste last 15 lines.
- `pnpm build` (root) — paste last 15 lines. Confirms the SPA build still bundles.

---

## Notes for the coder

- **Token usage**: use Tailwind classes mapped to CSS vars (`bg-background`, `bg-secondary`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-accent`, `bg-input`, `ring-ring`, `font-mono`). Do NOT hardcode hex values except where the existing code does for semantic accents (Crimson `#eb5757`, Indigo `#5e6ad2` — and only as icon stroke colors, never as fills).
- **Spacing**: `space-y-8` between main sections, `space-y-1.5` within a section, `gap-1.5`/`gap-2` for inline groups. Sidebar uses `space-y-1` between rows, `Separator` between groups.
- **Radius**: `rounded-md` (6px) for rows/inputs/buttons, `rounded-sm` for label pills/badges. No `rounded-lg`/`rounded-xl` on detail chrome.
- **Icons**: `lucide-react`, `size-3.5` or `size-4`. Priority icons are the custom SVGs from `priority-icons.tsx`.
- **No `font-bold`** anywhere. `font-medium` (510) is the emphasis weight.
- **Mono** for: task numbers, timestamps, IDs, the position indicator (`2/669`).
- **One Lime CTA on the detail page: none.** Save/Submit/Cancel are outline/ghost. This is compliant — the detail page's primary action is editing, which has no single dominant CTA.
- Match the established patterns in `board-header-bar.tsx` (h-11/h-12 header, `bg-secondary`, `border-b`) and `task-card.tsx` (border-defined rows, `bg-card`, `hover:bg-accent/30`) so the detail page feels like the same app.