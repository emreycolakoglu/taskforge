# Subscribe to Task + Inbox — Design

> Date: 2026-06-30
> Status: Approved (brainstorming complete, ready for implementation plan)

## Goal

Let users subscribe to tasks and receive notifications about relevant changes (comments and status changes) into a Linear-style inbox. The inbox is a three-column layout: main sidebar + notification list + inline task detail on the right.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Notification triggers | Comments + status changes only (incl. archived). Title/description/move/label/relation edits do not notify. |
| Auto-subscribe | Creator only, at task creation (when a logged-in user is present). Assigning does NOT auto-subscribe. |
| Read state | `readAt` timestamp + unread badge count on sidebar Inbox icon. |
| Right column | Inline task detail rendered inside the inbox (not a navigation away). |
| Self-actions | The actor of the change does not receive a notification for their own action. |
| MCP coverage | Full — `task_subscribe`, `task_unsubscribe`, `inbox_list`, `notifications_mark_read`. |
| Generation architecture | Activity-driven fan-out (Approach A). `NotificationsService` is called synchronously right after each activity row is created. |

## Data Model

Two new Prisma models, plus relations on `User` and `Task`:

```prisma
model TaskSubscription {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([taskId, userId])
  @@index([userId])
  @@index([taskId])
  @@map("task_subscriptions")
}

model Notification {
  id         String    @id @default(cuid())
  userId     String
  taskId     String
  activityId String
  action     String    // denormalized from activity.action for fast inbox rendering
  summary    String    // pre-rendered human string, e.g. "alice commented on TF-12"
  readAt     DateTime?
  createdAt  DateTime  @default(now())

  user     User     @relation(fields: [userId],     references: [id], onDelete: Cascade)
  task     Task     @relation(fields: [taskId],     references: [id], onDelete: Cascade)
  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notifications")
}
```

Add reverse relations on `User` and `Task`:

- `User.subscriptions TaskSubscription[]`
- `User.notifications Notification[]`
- `Task.subscriptions TaskSubscription[]`
- `Task.notifications Notification[]`

And a forward relation on `Activity`:

- `Activity.notification Notification?` (1:1 — an activity row fans out to at most one notification per user; the relation is to the activity's "primary" notification if any).

### Choices

- **Denormalized `summary`** — rendered once at creation time so the inbox list query never re-interprets `activity.detail` JSON.
- **`@@unique([taskId, userId])`** on subscriptions — makes toggle an upsert/delete path; no duplicate rows.
- **Cascade deletes** on both models — archiving a task removes its subscriptions and notifications (matches Linear: an archived task's notifications are no longer actionable).
- **Notification → Activity** — activity is the source of truth for full detail; `summary` is just the inbox-list label.

## Notification Generation Flow

A new `NotificationsModule` / `NotificationsService` is the single fan-out point, called synchronously right after each activity row is created in `TasksService` and `CommentsService`.

```
TasksService.update() / .move() / .remove()
CommentsService.create()
        │
        ▼
prisma.activity.create({ action, actorId, detail })   ← already exists
        │
        ▼
notificationsService.dispatchFromActivity(activity)   ← new
        │
        ├─ isNotifying(activity) ?  no → return
        │
        ├─ find subscriptions for activity.taskId
        ├─ exclude actor (activity.actorId)
        ├─ fetch task once (for task number + title to render summary)
        ├─ build summary string per recipient
        └─ prisma.notification.createMany({ data: [...] })
```

### Notify filter

`isNotifying(activity)` returns true iff:
- `activity.action === 'commented'`, OR
- `activity.action === 'updated'` AND the parsed `detail.changes` array contains a line starting with `status:`, OR
- `activity.action === 'archived'` (archived is treated as a status change).

All other activity types (`created`, `moved`, label attach/detach, relation changes, title/description edits) do **not** notify.

### Summary string format

Pre-rendered at creation time, stored in `Notification.summary`. Examples:

- `alice commented on TF-12 "Fix login bug"`
- `bob changed status of TF-12 to done`
- `carol archived TF-12 "Fix login bug"`

The task number + title are fetched with one `prisma.task.findUnique` inside `dispatchFromActivity`.

### Auto-subscribe (Creator only)

`TasksService.create()` calls `subscriptionsService.subscribe(taskId, user.id)` after task creation, **only** when `user` is present. No auto-subscribe on assign. Manual subscribe is always available via the UI/API.

### Exclude self

`dispatchFromActivity` filters `subscriptions.filter(s => s.userId !== activity.actorId)` before inserting notifications. An actor who is also a subscriber does not get a notification for their own action.

### Synchronous, not queued

Single SQLite DB, local/trusted-network app, low volume. A synchronous `createMany` inside the same request is simple and correct. If volume ever becomes a concern, the dispatch call site is the only thing that needs to change (swap to a job queue).

## API Surface

### REST — `subscriptions` module

| Method | Path | Action |
|---|---|---|
| `POST`   | `/api/tasks/:taskId/subscription` | Subscribe current user (idempotent upsert) |
| `DELETE` | `/api/tasks/:taskId/subscription` | Unsubscribe current user |
| `GET`    | `/api/tasks/:taskId/subscription` | `{ subscribed: boolean }` |

### REST — `notifications` module

| Method | Path | Action |
|---|---|---|
| `GET`    | `/api/notifications?filter=unread\|all` | Paginated list, newest first. Default `all`. Includes `taskId`, `taskNumber`, `summary`, `readAt`, `createdAt` |
| `GET`    | `/api/notifications/unread-count` | `{ count: number }` |
| `POST`   | `/api/notifications/:id/read` | Mark one notification read |
| `POST`   | `/api/notifications/read-all` | Mark all current user's notifications read |

All controllers reuse the existing `@CurrentUser` auth guard. No new auth code.

### MCP tools

Added to `tool-definitions.ts` and `mcp.service.ts`:

| Tool name | Args | Returns |
|---|---|---|
| `task_subscribe`           | `taskId`                              | `{ subscribed: true }` |
| `task_unsubscribe`         | `taskId`                              | `{ subscribed: false }` |
| `inbox_list`               | `filter?: 'unread'\|'all'`, `limit?: number` | `Notification[]` |
| `notifications_mark_read`  | `id?` (omit = mark all)               | `{ updated: number }` |

Routed via the existing `resource_action` pattern. The MCP session's authed user is the subscriber/recipient.

### Real-time updates

Add a **per-user room** `user:<userId>` alongside the existing `board:<boardId>` rooms:

- `EventsGateway.handleAuth` joins the socket to `user:<userId>` in addition to `board:<boardId>`.
- `NotificationsService.dispatchFromActivity` emits `notification:created` **per recipient** via a new optional 4th arg on `events.emit`: `events.emit('notification:created', notification, undefined, { userRoom: userId })`.
- `EventsService` routes: if `userRoom` is set, emit only to `user:<userId>` room (not broadcast).
- Web client `useSocket` adds a `'notification:created'` listener that invalidates `['notifications']` and `['notifications', 'unread-count']` query keys.

## Web UI

### Routing

| Path | Layout |
|---|---|
| `/inbox` | Sidebar + notification list + empty state on right ("Select a notification") |
| `/inbox/:notificationId` | Sidebar + notification list + inline task detail on right |

The disabled "Inbox" nav item in `PRIMARY_NAV` becomes enabled with `to: "/inbox"` and gains a live unread badge.

### Three-column inbox layout

```
┌──────────┬──────────────┬──────────────────────────┐
│ Sidebar  │ Notification │  Inline Task Detail      │
│ (w-64)   │ List         │  (reuses TaskDetailView) │
│          │ (w-[360px])  │                           │
│  Inbox●2 │ • alice…     │  Breadcrumb / title       │
│  My Issues│ • bob…  ●   │  Description              │
│  ----    │ • carol…     │  Sub-issues / relations   │
│  BOARDS  │              │  Activity / comments      │
│  ...     │              │  + Subscribe button       │
└──────────┴──────────────┴──────────────────────────┘
```

- **Notification list** (`InboxList`): fixed-width left column, `w-[360px]`, scrolls independently. Each row shows: actor avatar letter, `summary` text (Inter 13/510), task number in JetBrains Mono, relative timestamp (`2h ago`), and an unread dot (Cyan, per `design.md`) when `readAt === null`. Selected row gets `bg-sidebar-accent` + 2px Acid Lime left rail (the screen's single rationed lime use). Empty state: "No notifications" centered muted.
- **Inline task detail** (`InboxTaskDetail`): reuses the **inner content** of `TaskDetailPage` — extracted into a `TaskDetailView` component (title block, description editor, sub-issues, relations, activity, comments, properties sidebar). `TaskDetailPage` and `InboxTaskDetail` both render `<TaskDetailView taskId={...} boardId={...} />`. No duplication. A "Open in full page" link to `/board/:boardId/task/:taskId` is shown in the inbox's right column for users who want the dedicated route.

### Mark-as-read behavior

Clicking a notification in the list:
1. Sets it as selected (local state).
2. Calls `POST /api/notifications/:id/read` (idempotent — setting `readAt` again is a no-op).
3. Optimistically updates the `['notifications']` and `['notifications', 'unread-count']` query caches.
4. Loads the linked task into the right column via `useTask(taskId)`.

A "Mark all read" button lives at the top of the notification list.

### Subscribe button — TaskDetailView properties sidebar

A new `SubscribeButton` row in `DetailPropertiesSidebar`, placed above the Status row. States:
- **Subscribed:** filled outline button "Subscribed" with a Bell icon; click → `DELETE /api/tasks/:taskId/subscription`.
- **Not subscribed:** ghost button "Subscribe"; click → `POST /api/tasks/:taskId/subscription`.
- Queries `GET /api/tasks/:taskId/subscription` on mount; optimistically updates on click.

No Acid Lime on this control — it's a secondary action. Uses outline/ghost variants per `design.md` (the detail page has no Lime CTA, already documented in `task-detail-page.tsx`).

### Sidebar unread badge

`useUnreadCount()` hook → `GET /api/notifications/unread-count` with react-query, invalidated on `notification:created` socket events. Renders a small pill on the Inbox nav icon when count > 0; no pill when count is 0 (no decoration on a quiet inbox).

## Testing

Following existing conventions: API tests are integration tests against a real temp SQLite DB (`createTestPrisma()`, `prisma db push`), `afterEach` cleans tables in reverse dependency order. Web tests mock `global.fetch`.

### API tests

**`subscriptions.service.spec.ts`** (new in `apps/api/src/subscriptions/`):
- subscribe creates a row; duplicate subscribe is idempotent (upsert, no error)
- unsubscribe deletes the row; missing row is a no-op
- cascade: deleting the task removes subscriptions; deleting the user removes subscriptions
- `getSubscription` returns `{ subscribed: boolean }`

**`notifications.service.spec.ts`** (new):
- `dispatchFromActivity` creates one notification per subscriber, excluding the actor
- filter: `commented` notifies; `updated` with `status:` in detail notifies; `updated` with only title change does not; `archived` notifies; `created`/`moved` do not
- no subscribers → no notifications, no error
- `markRead` sets `readAt`; double-mark is idempotent
- `markAllRead` sets `readAt` on all of the user's rows, leaves other users' rows untouched
- `unreadCount` counts only `readAt IS NULL` for the user

**`subscriptions.controller.spec.ts`** / **`notifications.controller.spec.ts`**:
- POST/DELETE subscription endpoints require auth, return expected shapes
- GET notifications respects `filter=unread` vs `all`
- `read-all` endpoint marks the user's notifications read

**Extend `tasks.service.spec.ts` / `comments.service.spec.ts`:**
- creating a task subscribes the creator (assert `TaskSubscription` row exists)
- commenting on a task with a non-actor subscriber creates a `Notification` row
- the actor's own comment does not create a notification for themselves

### MCP tests

**Extend `mcp.service.spec.ts`:**
- `task_subscribe` / `task_unsubscribe` / `inbox_list` / `notifications_mark_read` route correctly and operate on the session's authed user
- `notifications_mark_read` with no `id` marks all read

### Web tests

**Extend `hooks/api.test.ts`** (mocks `global.fetch`):
- `api.subscribeTask(taskId)` → `POST /api/tasks/:id/subscription`
- `api.unsubscribeTask(taskId)` → `DELETE ...`
- `api.getSubscription(taskId)` → `GET ...`
- `api.listNotifications({ filter })`, `api.markRead(id)`, `api.markAllRead()`, `api.getUnreadCount()`

**Extend `use-socket.test.ts`:**
- `'notification:created'` event invalidates `['notifications']` and `['notifications', 'unread-count']` query keys

No new component tests (`.test.tsx`) — consistent with the repo's current lack of them, per `AGENTS.md`.

## Scope Boundaries

**In scope:**
- Schema migration for `TaskSubscription` and `Notification`
- `SubscriptionsModule`, `NotificationsModule` (service + controller + DTOs)
- Notification fan-out integrated into `TasksService` and `CommentsService`
- Auto-subscribe creator in `TasksService.create()`
- REST endpoints for subscriptions + notifications
- MCP tools for subscriptions + inbox
- `user:<userId>` WS room + `notification:created` event
- `/inbox` and `/inbox/:notificationId` routes
- `TaskDetailView` extraction (shared between `TaskDetailPage` and `InboxTaskDetail`)
- `InboxList`, `InboxTaskDetail`, `SubscribeButton`, sidebar unread badge
- Tests per the plan above

**Out of scope (future work):**
- Email/digest delivery
- Per-board subscription defaults
- @mention parsing (only explicit subscribe matters here)
- Notification preferences UI (mute categories)
- Bulk archive of read notifications