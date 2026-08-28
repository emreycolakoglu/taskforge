# Linear → TaskForge Feature Gap Analysis

Comparison of Linear's feature surface (per [linear.app/docs](https://linear.app/docs)) against TaskForge's current capabilities, with prioritized recommendations for what to add.

**Date:** Aug 2026
**Sources:** Linear docs (Cycles, Projects, Initiatives, Views, Triage, Issue Relations, Teams, Notifications, Display Options, Workflows, Asks); TaskForge `schema.prisma`, README, AGENTS.md, API controller surface.

---

## How they compare today

| Linear concept                                               | TaskForge equivalent                     | Status                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace → Teams                                            | Instance → Boards                        | **Diverged.** Linear scopes work under teams; TaskForge is flat (one instance, many boards). No team grouping.                                                     |
| Issues                                                       | Tasks                                    | ✅ Parity on basics (title, description, priority, assignee, due date, labels, number).                                                                            |
| Workflows / Statuses                                         | Statuses                                 | ✅ Parity (custom statuses, colors, WIP limits, `isDone`, `progress`).                                                                                             |
| Sub-issues                                                   | Sub-tasks (`parentId`)                   | ✅ Parity.                                                                                                                                                         |
| Issue relations (blocks / related / duplicate)               | Task relations (`blocks` / `related_to`) | ⚠️ **Missing `duplicate`.** Linear has a 4th relation type plus a system `Duplicate` status and merge flow.                                                        |
| Projects                                                     | —                                        | ❌ **No concept.** No way to group tasks across a feature's lifecycle with a lead, target date, and progress graph.                                                |
| Initiatives                                                  | —                                        | ❌ **No concept.** No cross-project roadmap grouping.                                                                                                              |
| Cycles (sprints)                                             | —                                        | ❌ **No concept.** No time-boxed iteration, rollover, capacity, or velocity tracking.                                                                              |
| Custom Views                                                 | —                                        | ❌ **No saved/persisted views.** `/tasks` list has no filter persistence; no per-user or shared views.                                                             |
| Triage                                                       | —                                        | ❌ **No intake queue.** Every task lands directly in a status.                                                                                                     |
| Notifications (inbox)                                        | Notifications + Inbox page               | ✅ Near parity (notifications + unread inbox). Missing: Slack/email/desktop channels, per-category toggles, email digests.                                         |
| Subscriptions                                                | Task subscriptions                       | ✅ Parity.                                                                                                                                                         |
| Comments                                                     | Comments                                 | ⚠️ Parity on create/delete. Missing: edits, reactions, @-mention parsing → auto-subscribe.                                                                         |
| Activity log                                                 | Activity                                 | ✅ Parity.                                                                                                                                                         |
| Documents                                                    | Documents (per task)                     | ✅ TaskForge already has Linear-beating scope here — Linear docs live at team/project level; TaskForge ties docs to tasks with `D-N` numbering and public sharing. |
| Public sharing                                               | `isPublic` task + document               | ✅ Parity (TaskForge's design is arguably cleaner — enumerated-by-design).                                                                                         |
| Display options (group/sort/board-list/sub-group/swim-lanes) | Kanban + List view                       | ⚠️ **Grouping is status-only on the board; list view is flat.** No group-by assignee/priority/label, no sub-grouping, no swim-lanes.                               |
| Templates (issue/project/doc)                                | —                                        | ❌ No templates.                                                                                                                                                   |
| Estimates                                                    | `estimate` (freeform float)              | ⚠️ Field exists but no rollup, no cycle capacity, no velocity calc.                                                                                                |
| Roadmap / Timeline                                           | —                                        | ❌ No timeline/Gantt view.                                                                                                                                         |
| Keyboard shortcuts                                           | —                                        | ❌ Minimal. Linear's entire UX is keyboard-driven (`Cmd+K`, `C`, `G T`, etc.).                                                                                     |
| Command palette                                              | —                                        | ❌ None.                                                                                                                                                           |
| Integrations (GitHub, Slack, Sentry, etc.)                   | MCP only                                 | ❌ No first-party integrations. MCP covers agent use but not CI/Slack/Sentry.                                                                                      |
| Linear Asks (intake from Slack/email/web)                    | —                                        | ❌ No request intake surface.                                                                                                                                      |
| Analytics                                                    | —                                        | ❌ No analytics/throughput charts.                                                                                                                                 |
| Auto-close / auto-archive                                    | Soft delete on tasks                     | ⚠️ Manual archive only. No time-based auto-close or auto-archive.                                                                                                  |
| Mobile app                                                   | PWA (installable)                        | ⚠️ PWA exists but no native app. Linear has iOS + Android.                                                                                                         |
| Importers                                                    | —                                        | ❌ No CSV/issue import.                                                                                                                                            |

---

## Recommendations

Prioritized by **impact-to-effort ratio** for a solo/small-team tool that already differentiates on human+agent collaboration. Linear's enterprise features (SAML/SCIM, private teams, initiative views) are deliberately excluded — they don't fit TaskForge's scale.

### P0 — High impact, low effort, fills obvious gaps

#### 1. Saved Custom Views

- **What:** Persist filter+group+sort combos as named views (`/board/:id?view=mine`, `/tasks?view=urgent-this-week`). Per-user and shared-with-board variants.
- **Why:** Linear's most-used power feature. TaskForge's `/tasks` is a flat table today; every visit resets filters. This is the single biggest UX gap for daily use.
- **Schema:** New `View` model (id, boardId?, userId? for personal vs shared, name, filters JSON, groupBy, sortBy, layout).
- **Effort:** M — one new module, one new page/panel, schema migration. No new domain logic.

#### 2. Duplicate relation + merge

- **What:** Add `duplicate` to `TaskRelation.type`; add a system `Duplicate` status category; "mark as duplicate" action moves the dup to Duplicate status and links it to the canonical task.
- **Why:** `blocks`/`related_to` already exist — this is a small extension to a proven pattern. Duplicates are a daily reality for any bug tracker.
- **Effort:** S — enum widen, one status flag, one service method, MCP tool param.

#### 3. Comment edits + reactions

- **What:** `PATCH /api/comments/:id` (with `updatedAt` already on the model), and a `CommentReaction` join (emoji, userId, commentId).
- **Why:** Comments are the collaboration surface; can't edit typos today. Reactions are low-cost and replace noise-comments ("+1", "ship it").
- **Effort:** S for edits, M for reactions (new join table + UI).

#### 4. @-mention parsing → auto-subscribe

- **What:** Parse `@displayName` in comments/descriptions; auto-subscribe mentioned users; emit a `mention` notification.
- **Why:** Subscriptions exist but require manual opt-in. Mentions are the universal signal for "this needs your eyes."
- **Effort:** S-M — regex/lookup on comment create, hook into existing subscription + notification services.

### P1 — High impact, medium effort, defines the product's next tier

#### 5. Projects

- **What:** A `Project` model (id, boardId or cross-board, name, leadId, status, targetDate, startDate, description, icon). Tasks get an optional `projectId`. Project page shows task list + progress (completed/total).
- **Why:** Linear's central planning unit. Without it, TaskForge can't express "the payments feature is 12 tasks across 3 boards, shipping Q3." The `metadata` JSON hack doesn't substitute.
- **Scope discipline:** Start with single-board projects (TaskForge's boards already group work). Cross-board projects and the full Linear project surface (milestones, health, updates, multi-team) are P2+.
- **Effort:** M — new module + page, `projectId` on Task, progress rollup query.

#### 6. Display options: group-by + sub-grouping

- **What:** On the board and list view, allow grouping by assignee / priority / label / due-date-bucket, not just status. Add sub-grouping (swim-lanes) on the board.
- **Why:** The board is status-grouped only. Linear's flexibility here is a core daily-driver reason. Pairs naturally with Saved Views (P0-1).
- **Effort:** M — frontend rework of the board's column model; backend already returns the data. No schema change.

#### 7. Command palette + keyboard shortcuts

- **What:** `Cmd/Ctrl+K` palette: search tasks, jump to board, create task, change status/priority/assignee on selected task. Single-letter shortcuts on the board (`N` new, `F` filter, `B` board/list toggle).
- **Why:** Linear's speed is its moat. TaskForge targets the same developer audience. A palette is the highest-leverage UX investment after saved views.
- **Effort:** M — new React component, shortcut registry, no backend work beyond the existing search endpoint.

#### 8. Task templates

- **What:** Board-level templates: a saved title/description/labels/priority/estimate preset that pre-fills the create dialog. Start with task templates only (not project/doc).
- **Why:** Recurring task types (bug report, incident, PR review) are retyped constantly. Low-risk, high-comfort feature.
- **Effort:** S-M — new `TaskTemplate` model or reuse `metadata`; a "Apply template" picker in the create dialog.

### P2 — Strategic, higher effort, only after P0/P1 land

#### 9. Cycles

- **What:** Board-level cycles (start/end dates, duration, auto-rollover of open tasks, capacity dial from estimate sum vs. past velocity).
- **Why:** The agile workflow Linear is built around. TaskForge already has `estimate` and statuses with `progress` — the primitives are half there.
- **Why P2:** Cycles only earn their keep once Projects (P1-5) and Saved Views (P0-1) exist — you need views to _look at_ a cycle. Shipping cycles first risks a feature nobody uses.
- **Effort:** L — new `Cycle` model, scheduler for rollover, capacity calc, cycle page, MCP tools.

#### 10. Triage / intake

- **What:** A reserved `Triage` status category per board; an intake view; optional triage-responsibility rotation. Eventually a public submission form (a stripped-down Linear Asks equivalent).
- **Why:** TaskForge's MCP angle means agents _create_ lots of tasks — they need a place to land that isn't "immediately in the backlog." Triage is the right pattern.
- **Why P2:** Requires workflow-category work on statuses first (Linear's Triage is a status _category_, not a separate flag).
- **Effort:** M for the queue + status category; L if including a public form.

#### 11. GitHub integration

- **What:** Link a task to a PR/issue; auto-move status on PR merge; close task on merge.
- **Why:** The single most-requested integration for any dev tracker. TaskForge's agent/MCP story already assumes a dev workflow.
- **Why P2:** Webhook infra + GitHub OAuth + mapping logic is its own project. MCP can bridge this today (an agent calls `tasks_update` on PR events).
- **Effort:** L — OAuth, webhook handler, mapping config, UI for connecting repos.

#### 12. Timeline / roadmap view

- **What:** Gantt-style view of projects (and later initiatives) over time. Zoom week/month/quarter.
- **Why:** Only meaningful once Projects (P1-5) exist with start/target dates.
- **Effort:** L — new frontend view, date math, no backend beyond project dates.

### Not recommended (bad fit for TaskForge)

| Linear feature                                     | Why skip                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Initiatives**                                    | Enterprise roadmapping layer above projects. TaskForge's audience (solo/small team) doesn't need a third nesting level. Projects + labels cover it.                                                          |
| **Teams / sub-teams / private teams**              | TaskForge is one instance, flat board list. Per-board `Member` roles already exist (even if unread). Adding teams is an architectural reset.                                                                 |
| **Linear Asks (Slack/email/web intake)**           | Requires SaaS infrastructure (email delivery, Slack OAuth, hosted forms). Out of scope for a self-hosted single-container tool. The public-task page is the right size of "shared surface" for this product. |
| **Triage Intelligence / Triage Rules (LLM-based)** | Linear's LLM triage needs a hosted model. TaskForge's MCP story already lets _the user's own agent_ do triage — that's the better architecture here.                                                         |
| **Analytics dashboards**                           | Low ROI until usage volume justifies it. The activity log + status `progress` field cover the basics.                                                                                                        |
| **Native mobile apps**                             | PWA is installable and offline-capable by design. Native apps are a maintenance burden that doesn't fit a solo project.                                                                                      |
| **SAML/SCIM, advanced access control**             | Enterprise auth. Invite tokens + admin/member roles are the right scope.                                                                                                                                     |

---

## Suggested sequencing

1. **P0 batch** (Saved Views, Duplicate relation, Comment edits/reactions, @-mention) — all independent, ship together. Purely additive, no existing feature reworked.
2. **P1 batch** (Projects, Display options, Command palette, Templates) — Projects is the load-bearing one; the other three compose with it and with Saved Views.
3. **P2 pick-one** — Cycles _or_ Triage _or_ GitHub, driven by who's actually using TaskForge by then. Don't build all three speculatively.

## One-line summary

TaskForge already matches Linear on the _task_ primitive and beats it on documents and agent access. The gaps are the _planning layer_ above tasks (projects, views, cycles) and the _collaboration polish_ (mentions, command palette, display flexibility) — not the enterprise features.
