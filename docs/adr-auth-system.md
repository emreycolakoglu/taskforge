# ADR: TaskForge Authentication System

**Status**: Proposed  
**Date**: 2026-06-18  
**Scope**: Full-stack — Prisma schema, API, MCP, WebSocket, Web SPA

---

## 1. Data Model Changes

### 1.1 New Models

#### User

```prisma
model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash  String
  displayName  String
  role         String     @default("member")  // "admin" | "member"
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  sessions     Session[]
  memberships  Member[]

  // Reverse relations for claimed entities
  assignedTasks Task[]       @relation("TaskAssignee")
  comments      Comment[]   @relation("CommentAuthor")
  activities    Activity[]  @relation("ActivityActor")
}
```

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String` | PK, `@default(cuid())` | CUID, consistent with existing models |
| `email` | `String` | `@unique` | Login identifier |
| `passwordHash` | `String` | — | bcrypt hash, never returned in API responses |
| `displayName` | `String` | required | Shown in UI, used for task claiming during onboarding |
| `role` | `String` | `@default("member")` | `"admin"` or `"member"`. Global role, not per-board |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

**Indexes**: `email` is unique (implicit from `@unique`).

#### Session

```prisma
model Session {
  id          String   @id @default(cuid())
  token       String   @unique
  userId      String
  bot         Boolean  @default(false)   // true for MCP bot tokens
  label       String?                     // human-readable label for bot tokens
  revokedAt   DateTime?                   // null = active; set = revoked
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
  @@index([expiresAt])
}
```

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String` | PK | |
| `token` | `String` | `@unique` | `crypto.randomUUID()`-generated bearer token |
| `userId` | `String` | FK → User.id, `onDelete: Cascade` | |
| `bot` | `Boolean` | `@default(false)` | Distinguishes human sessions from MCP bot tokens |
| `label` | `String?` | — | Optional label for bot tokens (e.g., "Claude", "GitHub Actions") |
| `revokedAt` | `DateTime?` | — | Null = active; non-null = revoked. Logout sets this |
| `expiresAt` | `DateTime` | — | 90 days from creation for human sessions; configurable for bot tokens |
| `createdAt` | `DateTime` | `@default(now())` | |

**Indexes**: `token` (unique, for lookup speed), `userId` (list user's sessions), `expiresAt` (cleanup query).

#### Settings

```prisma
model Settings {
  id         String   @id @default("singleton")
  title      String   @default("TaskForge")
  onboarded  Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String` | PK, always `"singleton"` | Single-row table |
| `title` | `String` | `@default("TaskForge")` | Instance display name from onboarding |
| `onboarded` | `Boolean` | `@default(false)` | `true` after first admin completes onboarding |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

#### InviteToken

```prisma
model InviteToken {
  id         String    @id @default(cuid())
  token      String    @unique
  createdBy  String
  usedBy     String?
  usedAt     DateTime?
  expiresAt  DateTime
  createdAt  DateTime  @default(now())

  creator User  @relation("CreatedInvites", fields: [createdBy], references: [id], onDelete: Cascade)
  user    User?  @relation("UsedInvites", fields: [usedBy], references: [id], onDelete: SetNull)

  @@index([token])
  @@index([createdBy])
}
```

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `String` | PK | |
| `token` | `String` | `@unique` | Random UUID, shareable link token |
| `createdBy` | `String` | FK → User.id, `onDelete: Cascade` | Admin who created it |
| `usedBy` | `String?` | FK → User.id, `onDelete: SetNull` | User who used it; null until used |
| `usedAt` | `DateTime?` | — | When it was used; null until used |
| `expiresAt` | `DateTime` | — | 7 days from creation by default |
| `createdAt` | `DateTime` | `@default(now())` | |

**User model update** — add reverse relations:

```prisma
model User {
  // ... existing fields ...

  createdInvites  InviteToken[] @relation("CreatedInvites")
  usedInvites     InviteToken[] @relation("UsedInvites")
}
```

### 1.2 Modified Models

#### Task — `assignee` → `assigneeId`

```prisma
model Task {
  id          String   @id @default(cuid())
  listId      String
  title       String
  description String?
  position    Float
  priority    String   @default("medium")
  status      String   @default("active")
  dueDate     DateTime?
  assigneeId  String?   // was: assignee String?
  metadata    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  list      List        @relation(fields: [listId], references: [id], onDelete: Cascade)
  assignee  User?       @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  labels    TaskLabel[]
  comments  Comment[]
  activity  Activity[]

  @@index([assigneeId])
}
```

**Migration note**: `assigneeId` replaces `assignee`. During migration, any `assignee` value that matches an existing `User.displayName` can be claimed during onboarding. All unmatched values are set to `NULL`. The reserved string `"agent"` is also nulled (only `Activity.actor` and `Comment.author` keep `"agent"` / `"system"` as reserved strings).

#### Comment — `author` → `authorId`

```prisma
model Comment {
  id        String   @id @default(cuid())
  taskId    String
  authorId  String?   // was: author String (now nullable for reserved strings)
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User?  @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)

  @@index([authorId])
}
```

**Migration note**: `authorId` replaces `author`. Values `"agent"` and `"system"` are preserved as `NULL` in the FK column — the application code will render them as "Agent" / "System" based on the `authorId === null && body` context, or we introduce a separate `authorType` field. **Simpler approach**: keep `author` as a denormalized display string alongside `authorId`. When `authorId` is set, `author` is populated from `User.displayName`. When `authorId` is null, `author` holds the reserved string.

**Revised Comment schema**:

```prisma
model Comment {
  id        String   @id @default(cuid())
  taskId    String
  authorId  String?
  author    String        // denormalized display name; "Agent" | "System" when authorId is null
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author User?  @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)

  @@index([authorId])
}
```

#### Activity — `actor` → `actorId`

```prisma
model Activity {
  id        String   @id @default(cuid())
  taskId    String
  actorId   String?   // was: actor String (now nullable for reserved strings)
  actor     String    // denormalized display name; "Agent" | "System" when actorId is null
  action    String
  detail    String?
  createdAt DateTime @default(now())

  task  Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actor User?  @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([actorId])
}
```

**Migration note**: Same pattern as Comment. `actor` is kept as a denormalized string. When `actorId` is set, `actor` mirrors `User.displayName`. When `actorId` is null, `actor` holds `"agent"` or `"system"`.

#### Member — `userId` becomes a real FK

```prisma
model Member {
  id      String @id @default(cuid())
  boardId String
  userId  String  // now a real FK
  role    String  @default("member")

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([boardId, userId])
  @@index([userId])
}
```

**Migration note**: Existing `Member.userId` freeform strings that don't match a `User.id` will be deleted during migration. Since there are no Users yet, all existing Members will be deleted (they're orphan data). The onboarding admin is auto-added as a member to any boards they should own.

### 1.3 Full Schema Diff

```diff
--- a/apps/api/prisma/schema.prisma
+++ b/apps/api/prisma/schema.prisma
@@ -9,6 +9,55 @@
   url      = env("DATABASE_URL")
 }
 
+model User {
+  id           String    @id @default(cuid())
+  email        String    @unique
+  passwordHash String
+  displayName  String
+  role         String    @default("member")
+  createdAt    DateTime  @default(now())
+  updatedAt    DateTime  @updatedAt
+
+  sessions      Session[]
+  memberships   Member[]
+  assignedTasks Task[]      @relation("TaskAssignee")
+  comments      Comment[]   @relation("CommentAuthor")
+  activities    Activity[]  @relation("ActivityActor")
+  createdInvites InviteToken[] @relation("CreatedInvites")
+  usedInvites    InviteToken[] @relation("UsedInvites")
+}
+
+model Session {
+  id        String    @id @default(cuid())
+  token     String    @unique
+  userId    String
+  bot       Boolean   @default(false)
+  label     String?
+  revokedAt DateTime?
+  expiresAt DateTime
+  createdAt DateTime  @default(now())
+
+  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
+
+  @@index([token])
+  @@index([userId])
+  @@index([expiresAt])
+}
+
+model Settings {
+  id         String  @id @default("singleton")
+  title      String  @default("TaskForge")
+  onboarded  Boolean @default(false)
+  createdAt  DateTime @default(now())
+  updatedAt  DateTime @updatedAt
+}
+
+model InviteToken {
+  id        String    @id @default(cuid())
+  token     String    @unique
+  createdBy String
+  usedBy    String?
+  usedAt    DateTime?
+  expiresAt DateTime
+  createdAt DateTime  @default(now())
+
+  creator User  @relation("CreatedInvites", fields: [createdBy], references: [id], onDelete: Cascade)
+  user    User? @relation("UsedInvites", fields: [usedBy], references: [id], onDelete: SetNull)
+
+  @@index([token])
+  @@index([createdBy])
+}
+
 model Board {
   id        String   @id @default(cuid())
   name      String
@@ -36,10 +85,11 @@
 }
 
 model Task {
-  id          String   @id @default(cuid())
-  listId      String
-  title       String
-  description String?
-  position    Float
-  priority    String   @default("medium") // low, medium, high, urgent
-  status      String   @default("active") // active, archived, done
-  dueDate     DateTime?
-  assignee    String?  // user or agent identifier
-  metadata    String?  // JSON blob for extensibility
-  createdAt   DateTime @default(now())
-  updatedAt   DateTime @updatedAt
+  id          String    @id @default(cuid())
+  listId      String
+  title       String
+  description String?
+  position    Float
+  priority    String    @default("medium")
+  status      String    @default("active")
+  dueDate     DateTime?
+  assigneeId  String?
+  metadata    String?
+  createdAt   DateTime  @default(now())
+  updatedAt   DateTime  @updatedAt
 
-  list     List      @relation(fields: [listId], references: [id], onDelete: Cascade)
-  labels   TaskLabel[]
-  comments Comment[]
-  activity Activity[]
+  list      List       @relation(fields: [listId], references: [id], onDelete: Cascade)
+  assignee  User?      @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
+  labels    TaskLabel[]
+  comments  Comment[]
+  activity  Activity[]
+
+  @@index([assigneeId])
 }
 
@@ -74,13 +124,15 @@
 }
 
 model Comment {
-  id        String   @id @default(cuid())
-  taskId    String
-  author    String
-  body      String
-  createdAt DateTime @default(now())
-  updatedAt DateTime @updatedAt
+  id        String   @id @default(cuid())
+  taskId    String
+  authorId  String?
+  author    String
+  body      String
+  createdAt DateTime @default(now())
+  updatedAt DateTime @updatedAt
 
-  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
+  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
+  author User?  @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
+
+  @@index([authorId])
 }
 
 model Activity {
-  id        String   @id @default(cuid())
-  taskId    String
-  actor     String
-  action    String   // created, moved, assigned, commented, status_changed, etc.
-  detail    String?  // JSON with before/after values
-  createdAt DateTime @default(now())
+  id        String   @id @default(cuid())
+  taskId    String
+  actorId   String?
+  actor     String
+  action    String
+  detail    String?
+  createdAt DateTime @default(now())
 
-  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
+  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
+  actor User? @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)
+
+  @@index([actorId])
 }
 
 model Member {
   id      String @id @default(cuid())
   boardId String
   userId  String
   role    String @default("member")
 
   board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
+  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
 
   @@unique([boardId, userId])
+  @@index([userId])
 }
```

---

## 2. Onboarding Flow

### 2.1 Overview

Onboarding is a **one-shot process** that creates the first admin user and the Settings singleton. Once `Settings.onboarded === true`, the onboarding route redirects away.

### 2.2 Flow Diagram

```
App Load
  │
  ├── GET /api/auth/status
  │     Response: { onboarded: boolean, title: string | null }
  │
  ├── If onboarded === false:
  │     ├── Show OnboardingPage
  │     │     Step 1: Enter instance title + admin display name + email + password
  │     │     Step 2 (optional): Claim tasks — show list of tasks where
  │     │            Task.assignee matches displayName (case-insensitive)
  │     │     Step 3: Submit → POST /api/auth/onboard
  │     │
  │     └── On success: store token in localStorage, redirect to /
  │
  └── If onboarded === true:
        ├── GET /api/auth/me (with token)
        │     ├── 200 → user is authenticated, show app
        │     └── 401 → redirect to /login
        └── If no token in localStorage → redirect to /login
```

### 2.3 API Endpoints for Onboarding

#### `GET /api/auth/status`

Public endpoint (no auth required). Returns:

```json
{
  "onboarded": false,
  "title": null
}
```

or after onboarding:

```json
{
  "onboarded": true,
  "title": "Acme Task Board"
}
```

#### `POST /api/auth/onboard`

Public endpoint. **409 Conflict** if `Settings.onboarded === true`.

Request body:
```json
{
  "title": "Acme Task Board",
  "displayName": "Alice",
  "email": "alice@example.com",
  "password": "secret123",
  "claimTaskIds": ["clxabc123", "clxabc456"]
}
```

Validation:
- `title`: 1–100 chars, required
- `displayName`: 1–100 chars, required
- `email`: valid email, required
- `password`: ≥ 6 chars, required
- `claimTaskIds`: array of existing task IDs, optional

Server logic:
1. Check `Settings.onboarded` — if true, return 409.
2. Create Settings singleton row with `title` and `onboarded: true`.
3. Hash password with bcrypt (cost factor 12).
4. Create User with `email`, `passwordHash`, `displayName`, `role: "admin"`.
5. Create Session with 90-day expiry, `bot: false`.
6. For each `claimTaskIds`: update `Task.assigneeId` to the new user's `id` (only if current `assigneeId` is null AND the task's previous `assignee` string matched the user's `displayName` case-insensitively — this is a safety check).
7. Add the user as `Member` with `role: "admin"` to all existing boards.
8. Return `{ user, token }`.

Response:
```json
{
  "user": {
    "id": "clx...",
    "email": "alice@example.com",
    "displayName": "Alice",
    "role": "admin"
  },
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2.4 Claim Tasks Step

During onboarding, after the user enters their `displayName`, the frontend calls:

#### `GET /api/auth/claimable-tasks?displayName=Alice`

Public endpoint (only available before onboarding). Returns tasks where `Task.assigneeId IS NULL AND lower(Task.assignee) = lower(displayName)`:

```json
[
  {
    "id": "clxabc123",
    "title": "Fix login bug",
    "assignee": "Alice",
    "listId": "..."
  }
]
```

The frontend shows these as checkboxes the user can select before submitting the onboarding form.

---

## 3. Authentication Flow

### 3.1 Login

#### `POST /api/auth/login`

Public endpoint.

Request:
```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```

Server logic:
1. Find User by email (case-insensitive lookup).
2. Compare password with `bcrypt.compare`.
3. If match: create a Session with `token = crypto.randomUUID()`, `expiresAt = now + 90 days`, `bot = false`.
4. If no match: return 401 `{ message: "Invalid credentials" }`.

Response (200):
```json
{
  "user": {
    "id": "clx...",
    "email": "alice@example.com",
    "displayName": "Alice",
    "role": "admin"
  },
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 3.2 Token Validation Middleware

A NestJS guard (`AuthGuard`) that:

1. Extracts `Authorization: Bearer <token>` from the request header.
2. Looks up `Session` by `token` where `revokedAt IS NULL` and `expiresAt > now()`.
3. Eagerly loads the `user` relation.
4. Attaches `{ userId, user, session }` to `request.user` / `request.session`.
5. Returns 401 if token is missing, invalid, revoked, or expired.

Applied globally via `app.useGlobalGuards(AuthGuard)`, **except** for whitelisted routes:

**Public routes** (no auth required):
- `POST /api/auth/login`
- `POST /api/auth/onboard`
- `GET /api/auth/status`
- `GET /api/auth/claimable-tasks`
- `POST /api/auth/signup` (invite flow)
- `POST /api/mcp` (auth via MCP protocol — separate handling)

All other `/api/*` routes require auth.

### 3.3 Session Management

- **Creation**: On login/onboarding, a single `Session` row is created.
- **Validation**: Every authenticated request does `Session.findUnique({ where: { token }, include: { user } })` with the revocation/expiry check.
- **Logout**: `POST /api/auth/logout` — sets `Session.revokedAt = now()` on the current session.
- **Revoke all**: `POST /api/auth/logout-all` — sets `revokedAt = now()` on all sessions for the current user except the current one.
- **Cleanup**: A periodic task (NestJS `@Cron`) runs daily to delete sessions where `expiresAt < now()` OR `revokedAt < 30 days ago`. Keeps the table small.

### 3.4 Token Refresh

**No refresh tokens.** Sessions are 90 days. If expired, the user logs in again. This is acceptable for a local/trusted-network app.

### 3.5 Current User

#### `GET /api/auth/me`

Auth required. Returns the current user:

```json
{
  "id": "clx...",
  "email": "alice@example.com",
  "displayName": "Alice",
  "role": "admin"
}
```

`passwordHash` is never included in any API response. Use a `@Exclude()` from `class-transformer` or manually strip it in the service.

---

## 4. Invite Flow

### 4.1 Admin Creates an Invite

#### `POST /api/auth/invite`

Auth required, admin only. Request:

```json
{
  "label": "Bob's invite",
  "expiresInDays": 7
}
```

`expiresInDays` defaults to 7. `label` is optional.

Server logic:
1. Verify `request.user.role === "admin"`. 403 if not.
2. Generate `token = crypto.randomUUID()`.
3. Create `InviteToken` with `createdBy = user.id`, `expiresAt = now() + expiresInDays days`.
4. Return the invite token.

Response:
```json
{
  "id": "clx...",
  "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "label": "Bob's invite",
  "expiresAt": "2026-06-25T00:00:00.000Z",
  "url": "http://localhost:3000/signup?token=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

The `url` field is constructed from `Settings.title` or the request origin.

### 4.2 List Invites

#### `GET /api/auth/invites`

Auth required, admin only. Returns all invite tokens (including used/expired) for auditing.

### 4.3 Revoke an Invite

#### `DELETE /api/auth/invite/:id`

Auth required, admin only. Deletes the invite token.

### 4.4 Invited User Signs Up

#### `POST /api/auth/signup`

Public endpoint.

Request:
```json
{
  "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "displayName": "Bob",
  "email": "bob@example.com",
  "password": "secret456",
  "claimTaskIds": []
}
```

Server logic:
1. Look up `InviteToken` by `token`.
2. Verify `usedBy IS NULL` and `expiresAt > now()`. If invalid/expired/used, return 400.
3. Check `email` is not already taken. If taken, return 409.
4. Hash password, create User with `role: "member"`.
5. Mark `InviteToken.usedBy = user.id`, `InviteToken.usedAt = now()`.
6. Create Session (90-day, `bot: false`).
7. Optionally add user as Member to boards (admin decides — not in V1; admin adds members manually).
8. Process `claimTaskIds` same as onboarding.
9. Return `{ user, token }`.

---

## 5. API Surface

### 5.1 New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/auth/status` | No | Check if onboarding is needed |
| `POST` | `/api/auth/onboard` | No | Complete onboarding, create first admin |
| `GET` | `/api/auth/claimable-tasks` | No | List tasks claimable by displayName |
| `POST` | `/api/auth/login` | No | Email + password login |
| `POST` | `/api/auth/signup` | No | Signup with invite token |
| `GET` | `/api/auth/me` | Yes | Get current user |
| `POST` | `/api/auth/logout` | Yes | Revoke current session |
| `POST` | `/api/auth/logout-all` | Yes | Revoke all other sessions |
| `POST` | `/api/auth/invite` | Admin | Create invite token |
| `GET` | `/api/auth/invites` | Admin | List invite tokens |
| `DELETE` | `/api/auth/invite/:id` | Admin | Delete/revoke invite token |
| `PUT` | `/api/auth/password` | Yes | Change current user's password |
| `PUT` | `/api/auth/profile` | Yes | Change display name |
| `POST` | `/api/auth/bot-token` | Admin | Create a bot/MCP session token |
| `GET` | `/api/settings` | Yes | Get instance settings (title) |
| `PUT` | `/api/settings` | Admin | Update instance settings |

### 5.2 Request/Response Shapes

#### `POST /api/auth/onboard`

```typescript
// Request
interface OnboardDto {
  title: string;          // 1-100 chars
  displayName: string;    // 1-100 chars
  email: string;          // valid email
  password: string;       // >= 6 chars
  claimTaskIds?: string[];
}

// Response
interface AuthResponse {
  user: UserResponse;
  token: string;
}

interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
}
```

#### `POST /api/auth/login`

```typescript
// Request
interface LoginDto {
  email: string;
  password: string;
}

// Response: AuthResponse
```

#### `POST /api/auth/signup`

```typescript
// Request
interface SignupDto {
  token: string;          // invite token
  displayName: string;
  email: string;
  password: string;       // >= 6 chars
  claimTaskIds?: string[];
}

// Response: AuthResponse
```

#### `PUT /api/auth/password`

```typescript
// Request
interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;     // >= 6 chars
}
```

#### `PUT /api/auth/profile`

```typescript
// Request
interface UpdateProfileDto {
  displayName: string;    // 1-100 chars
}
```

#### `POST /api/auth/bot-token`

```typescript
// Request
interface CreateBotTokenDto {
  label?: string;         // e.g., "Claude MCP"
  expiresInDays?: number; // default 365
}

// Response
interface BotTokenResponse {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string;
}
```

#### `GET /api/settings`

```typescript
interface SettingsResponse {
  title: string;
  onboarded: boolean;
}
```

#### `PUT /api/settings`

```typescript
// Request (admin only)
interface UpdateSettingsDto {
  title: string;
}

// Response: SettingsResponse
```

### 5.3 Modified Endpoints

**All existing endpoints** (`/api/boards/*`, `/api/tasks/*`, `/api/comments/*`, `/api/labels/*`, `/api/lists/*`, `/api/activity/*`) now require authentication. Unauthenticated requests receive `401 Unauthorized`.

**`POST /api/comments`**: The `author` field is no longer taken from the request body. Instead, it's derived from the authenticated user's `displayName`. The `author` field in the DTO is removed; `authorId` is set from `request.user.id`.

**`POST /api/tasks`**: The `assignee` field changes semantics. If provided, it must be a valid `User.id` (renamed to `assigneeId` in the DTO). If empty/null, no assignee. The string-based "agent" assignee is removed — MCP clients set `assigneeId` to a real user or leave it null.

**MCP endpoint** (`POST /api/mcp`, `POST /api/mcp/jsonrpc`): Requires `Authorization: Bearer <token>` header. Same `AuthGuard`, same token format. The MCP service receives the authenticated user via `request.user`.

### 5.4 Changed Response Shapes

**Task responses** now include:

```typescript
interface TaskResponse {
  // ...existing fields...
  assigneeId: string | null;     // replaces assignee string
  assignee?: { id: string; displayName: string } | null;  // included when withRelations
}
```

**Comment responses** now include:

```typescript
interface CommentResponse {
  id: string;
  taskId: string;
  authorId: string | null;
  author: string;        // "Alice" or "Agent" or "System"
  body: string;
  createdAt: string;
  updatedAt: string;
}
```

**Activity responses** now include:

```typescript
interface ActivityResponse {
  id: string;
  taskId: string;
  actorId: string | null;
  actor: string;         // "Alice" or "agent" or "system"
  action: string;
  detail: string | null;
  createdAt: string;
}
```

**Member responses** now include:

```typescript
interface MemberResponse {
  id: string;
  boardId: string;
  userId: string;
  role: "admin" | "member" | "viewer";
  user?: { id: string; displayName: string; email: string };
}
```

---

## 6. MCP Changes

### 6.1 Authentication

The MCP endpoint (`POST /api/mcp`, `POST /api/mcp/jsonrpc`) uses the same bearer token auth as REST. The `AuthGuard` checks the `Authorization` header before the request reaches `McpService`.

If auth fails, the MCP endpoint returns a standard JSON-RPC error:

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32001,
    "message": "Authentication required"
  }
}
```

### 6.2 Bot Token Generation

An admin can create a long-lived "bot token" via `POST /api/auth/bot-token`. This creates a `Session` with `bot: true` and a configurable expiry (default 365 days). The token is a standard bearer token — there is no special MCP token type.

Bot tokens appear in the user's session list (accessible via a future settings page). They can be revoked like any other session.

### 6.3 MCP Service Changes

`McpService.handleRequest()` currently receives no user context. After auth, the request object will carry `req.user`. The MCP controller will pass the user to `McpService`:

```typescript
// mcp.controller.ts (modified)
@Post()
async handlePost(@Body() body: any, @Req() req: Request) {
  return this.mcp.handleRequest(body, req.user);
}
```

All MCP methods that create entities will use `user.id` for `authorId`/`actorId` fields instead of accepting them from params. Specifically:

- `tasks_create`: `actorId = user.id`, `actor = user.displayName`, `assigneeId = params.assigneeId || null`
- `comments_create`: `authorId = user.id`, `author = user.displayName`
- All activity logging uses `actorId = user.id`, `actor = user.displayName`

MCP params that previously accepted `assignee` (string) now accept `assigneeId` (string, must be a valid User.id or null).

### 6.4 MCP Methods for Auth

No new MCP methods for auth in V1. MCP clients use the REST API to obtain tokens, or the admin creates bot tokens via the REST API and configures them into the MCP client.

---

## 7. WebSocket Changes

### 7.1 Auth Handshake Protocol

Currently, `EventsGateway.handleConnection()` accepts all connections without auth. After auth:

1. Client connects to `/ws` as before (optionally with `boardId` query param).
2. Client **must** send an auth message within **5 seconds**:
   ```json
   { "type": "auth", "token": "550e8400-e29b-41d4-a716-446655440000" }
   ```
3. Server validates the token against the `Session` table (same logic as `AuthGuard`).
4. If valid: server responds with `{ "type": "auth_ok", "user": { ... } }` and attaches the user to the socket.
5. If invalid or not received within 5 seconds: server disconnects with `{ "type": "auth_error", "message": "..." }` then `client.disconnect()`.

### 7.2 Implementation

```typescript
// events.gateway.ts (modified)
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  // ...

  private unauthenticatedSockets = new Map<string, NodeJS.Timeout>();

  async handleConnection(client: Socket) {
    // Set 5-second deadline for auth
    const timeout = setTimeout(() => {
      client.emit('auth_error', { message: 'Authentication required' });
      client.disconnect(true);
    }, 5000);

    this.unauthenticatedSockets.set(client.id, timeout);
  }

  @SubscribeMessage('auth')
  async handleAuth(@ConnectedSocket() client: Socket, @MessageBody() data: { token: string }) {
    const session = await this.prisma.session.findUnique({
      where: { token: data.token },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      client.emit('auth_error', { message: 'Invalid or expired token' });
      client.disconnect(true);
      return;
    }

    // Clear the timeout
    const timeout = this.unauthenticatedSockets.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.unauthenticatedSockets.delete(client.id);
    }

    // Attach user to socket
    (client as any).user = session.user;
    client.emit('auth_ok', { user: { id: session.user.id, displayName: session.user.displayName, role: session.user.role } });

    // Join board rooms as before
    const boardId = client.handshake.query.boardId as string;
    if (boardId) {
      client.join(`board:${boardId}`);
    }
  }

  handleDisconnect(client: Socket) {
    const timeout = this.unauthenticatedSockets.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.unauthenticatedSockets.delete(client.id);
    }
  }
}
```

### 7.3 Frontend WebSocket Change

The existing Socket.IO client connection needs to:

1. Connect as before.
2. Immediately emit `auth` with the stored token.
3. Listen for `auth_ok` / `auth_error`.
4. On `auth_error` or disconnect, redirect to login.

```typescript
const socket = io('/ws');
socket.emit('auth', { token: storedToken });
socket.on('auth_ok', (data) => { /* connected */ });
socket.on('auth_error', (data) => { /* redirect to login */ });
```

---

## 8. Frontend Changes

### 8.1 New Routes/Pages

| Path | Component | Auth Required | Description |
|------|-----------|---------------|-------------|
| `/onboarding` | `OnboardingPage` | No | Onboarding wizard (only accessible when not yet onboarded) |
| `/login` | `LoginPage` | No | Email + password login form |
| `/signup/:token` | `SignupPage` | No | Signup with invite token |
| `/account` | `AccountPage` | Yes | Change display name and password |

### 8.2 Route Guard — `AuthContext`

A React context provider that:

1. On app load, checks `localStorage.getItem('taskforge_token')`.
2. If token present, calls `GET /api/auth/me`. If 200, sets `user` in context. If 401, clears token.
3. If no token, `user` is null.
4. Provides `{ user, login, logout, loading }`.

### 8.3 Route Guard — `OnboardingGuard`

A component that wraps the app and checks `GET /api/auth/status`:

```tsx
function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup/:token" element={<SignupPage />} />
            <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><SidebarLayout><HomePage /></SidebarLayout></RequireAuth>} />
            <Route path="/board/:id" element={<RequireAuth><SidebarLayout><KanbanBoard /></SidebarLayout></RequireAuth>} />
            <Route path="/tasks" element={<RequireAuth><SidebarLayout><TasksPage /></SidebarLayout></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SidebarLayout><SettingsPage /></SidebarLayout></RequireAuth>} />
            <Route path="*" element={<SidebarLayout><NotFoundPage /></SidebarLayout>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
```

`<RequireAuth>` redirects to `/login` if `user` is null.  
`<OnboardingPage>` redirects to `/login` if `onboarded === true`.

### 8.4 API Client Changes

The `api` module in `apps/web/src/hooks/api.ts` needs:

1. **Token injection**: Every request includes `Authorization: Bearer ${token}` header when token is present.
2. **Auto-logout on 401**: If any request returns 401, clear the token and redirect to `/login`.
3. **New API methods**:

```typescript
// Add to api object:
auth: {
  status: () => request<{ onboarded: boolean; title: string | null }>('/auth/status'),
  onboard: (data: OnboardDto) => request<AuthResponse>('/auth/onboard', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: LoginDto) => request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  signup: (data: SignupDto) => request<AuthResponse>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<UserResponse>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  logoutAll: () => request<void>('/auth/logout-all', { method: 'POST' }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<void>('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
  updateProfile: (data: { displayName: string }) =>
    request<void>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  claimableTasks: (displayName: string) =>
    request<Task[]>(`/auth/claimable-tasks?displayName=${encodeURIComponent(displayName)}`),
},
```

3. **Remove `author` from comment creation** — `api.comments.create` no longer sends `author`; it's derived from the auth token.

```typescript
comments: {
  // ...
  create: (data: { taskId: string; body: string }) =>  // author removed
    request<Comment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
},
```

4. **`assignee` → `assigneeId`** in task creation/update:

```typescript
tasks: {
  create: (data: { listId: string; title: string; description?: string; priority?: string; assigneeId?: string; labelIds?: string[] }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TaskUpdate>) =>
    request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  // ...
},
```

### 8.5 Type Changes

The `types/index.ts` file needs updates:

```typescript
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'member';
}

export interface Task {
  // ...
  assigneeId?: string;         // was: assignee?: string
  assignee?: { id: string; displayName: string } | null;  // relation
  // ...
}

export interface Comment {
  // ...
  authorId?: string;           // new
  author: string;              // kept as display name
  // ...
}

export interface Activity {
  // ...
  actorId?: string | null;     // new
  actor: string;               // kept as display name
  // ...
}

export interface Member {
  // ...
  user?: { id: string; displayName: string; email: string };  // new
}

export interface AuthResponse {
  user: User;
  token: string;
}
```

---

## 9. Migration Strategy

### 9.1 Prisma Migration Steps

1. **Create the migration**:
   ```bash
   cd apps/api
   npx prisma migrate dev --name add-auth
   ```

2. **Custom migration SQL** — Prisma can't handle all the data migration, so we write a custom migration:

```sql
-- Step 1: Create new tables
CREATE TABLE User (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  displayName TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX User_email_key ON User(email);

CREATE TABLE Session (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  userId TEXT NOT NULL,
  bot BOOLEAN NOT NULL DEFAULT FALSE,
  label TEXT,
  revokedAt DATETIME,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX Session_token_key ON Session(token);
CREATE INDEX Session_userId_idx ON Session(userId);
CREATE INDEX Session_expiresAt_idx ON Session(expiresAt);

CREATE TABLE Settings (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton',
  title TEXT NOT NULL DEFAULT 'TaskForge',
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE InviteToken (
  id TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  usedBy TEXT,
  usedAt DATETIME,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (createdBy) REFERENCES User(id) ON DELETE CASCADE,
  FOREIGN KEY (usedBy) REFERENCES User(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX InviteToken_token_key ON InviteToken(token);
CREATE INDEX InviteToken_createdBy_idx ON InviteToken(createdBy);

-- Step 2: Add new columns to existing tables (nullable first for migration)
ALTER TABLE Task ADD COLUMN assigneeId TEXT;
ALTER TABLE Comment ADD COLUMN authorId TEXT;
ALTER TABLE Activity ADD COLUMN actorId TEXT;

-- Step 3: Add foreign keys (SQLite doesn't support ADD CONSTRAINT, so this
-- happens implicitly through Prisma's migration). In Prisma's migration,
-- the relations are defined in the schema and Prisma handles the FK creation.

-- Step 4: Clear Member table (orphan data — no Users exist yet)
DELETE FROM Member;

-- Step 5: Null out assigneeId where Task.assignee is 'agent' or 'system'
-- These are reserved strings that shouldn't become FK references
UPDATE Task SET assigneeId = NULL WHERE assignee IN ('agent', 'system');

-- Step 6: For remaining Task.assignee values, leave assigneeId as NULL.
-- The onboarding flow's "claim tasks" feature will let the first admin
-- claim matching tasks.
UPDATE Task SET assigneeId = NULL WHERE assigneeId IS NULL;

-- Step 7: Drop old columns (Prisma handles this in the generated migration
-- when we rename assignee -> assigneeId in the schema).
-- Note: SQLite doesn't support DROP COLUMN before v3.35.0.
-- Prisma will handle this by recreating the table.
```

### 9.2 Claim Tasks Logic During Onboarding

When the first admin onboards:

1. The frontend calls `GET /api/auth/claimable-tasks?displayName=Alice`.
2. Server returns all `Task` rows where `Task.assigneeId IS NULL AND lower(Task.assignee) = lower('Alice')`.
3. The user selects which tasks to claim.
4. On `POST /api/auth/onboard`, the selected `claimTaskIds` are updated:
   ```sql
   UPDATE Task SET assigneeId = :userId WHERE id IN (:claimTaskIds)
   ```
5. The `assignee` display string column is also updated to match the user's displayName for consistency (though it will be denormalized from the relation going forward).

### 9.3 Null Handling for actor/author Fields

For `Comment.author` and `Activity.actor`:

- When `authorId`/`actorId` is set, the string field mirrors `User.displayName`.
- When `authorId`/`actorId` is null, the string field holds reserved values: `"agent"` or `"system"`.
- During creation by authenticated users, always set both `authorId = user.id` and `author = user.displayName`.
- For MCP/AI actions, set `authorId = null` and `author = "Agent"` (or the bot user's ID if using a bot token).
- For system-triggered events, set `actorId = null` and `actor = "System"`.

For `Task.assigneeId`:

- Strict FK — only valid `User.id` or null. No reserved strings.
- The old `Task.assignee` string column is removed. `assigneeId` is the sole reference.
- API responses include the related `User` object when requested.

---

## 10. Module Structure

### 10.1 New NestJS Modules

#### AuthModule (`apps/api/src/auth/`)

```
auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.guard.ts
├── auth.decorator.ts
├── dto/
│   ├── login.dto.ts
│   ├── onboard.dto.ts
│   ├── signup.dto.ts
│   ├── invite.dto.ts
│   ├── change-password.dto.ts
│   └── update-profile.dto.ts
└── auth.service.spec.ts
```

- **`AuthModule`** — imports `PrismaModule` (global), provides `AuthService`, `AuthGuard`, registers controller.
- **`AuthController`** — handles all `/api/auth/*` endpoints.
- **`AuthService`** — business logic: password hashing, session creation/validation, invite tokens, onboarding.
- **`AuthGuard`** — NestJS `CanActivate` guard, injectable globally. Checks `Authorization: Bearer <token>` header. Attaches `user` and `session` to `request`. Uses `reflector` to skip public routes.
- **`@Public()` decorator** — marks endpoints that skip `AuthGuard`. Applied to login, onboard, signup, and status endpoints.

#### SettingsModule (`apps/api/src/settings/`)

```
settings/
├── settings.module.ts
├── settings.controller.ts
├── settings.service.ts
└── dto/
    └── update-settings.dto.ts
```

- **`SettingsModule`** — imports `PrismaModule`, provides `SettingsService`.
- **`SettingsController`** — `GET /api/settings`, `PUT /api/settings` (admin only).
- **`SettingsService`** — CRUD on the Settings singleton. `getSettings()`, `updateSettings()`.

### 10.2 Modified Existing Modules

#### AppModule

```typescript
@Module({
  imports: [
    PrismaModule,
    AuthModule,      // new
    SettingsModule,  // new
    BoardsModule,
    ListsModule,
    TasksModule,
    CommentsModule,
    LabelsModule,
    ActivityModule,
    McpModule,
    EventsModule,
  ],
})
export class AppModule {}
```

#### Main.ts

Register `AuthGuard` as a global guard:

```typescript
import { AuthGuard } from './auth/auth.guard';

// In bootstrap():
const reflector = app.get(Reflector);
app.useGlobalGuards(new AuthGuard(reflector));
```

#### TasksModule / TasksService

- `CreateTaskDto`: rename `assignee` → `assigneeId` (optional string).
- `UpdateTaskDto`: rename `assignee` → `assigneeId`.
- `TasksService.create()`: use `req.user.id` for `Activity.actorId` and `Activity.actor = user.displayName`.
- `TasksService.update()`: same.
- `TasksService.move()`: same.
- All activity creation calls include both `actorId` and `actor`.

#### CommentsModule / CommentsService

- `CreateCommentDto`: remove `author` field. Add `@Request()` injection in controller to pass `user`.
- `CommentsService.create()`: set `authorId = user.id`, `author = user.displayName`.

#### EventsGateway

- Inject `PrismaService` for token validation.
- Add `@SubscribeMessage('auth')` handler.
- Add 5-second timeout for unauthenticated sockets.
- Store `user` on the socket for downstream use.

#### McpModule / McpController

- Inject `@Request()` to get `user` from `AuthGuard`.
- Pass `user` to `McpService.handleRequest(req, user)`.
- `McpService` uses `user.id` for `authorId`/`actorId` and `user.displayName` for `author`/`actor`.
- MCP methods that accept `assignee` change to accept `assigneeId`.

### 10.3 Guard Whitelist

The `AuthGuard` skips routes decorated with `@Public()`:

| Route | Method | Public? |
|-------|--------|---------|
| `/api/auth/status` | GET | Yes |
| `/api/auth/onboard` | POST | Yes |
| `/api/auth/login` | POST | Yes |
| `/api/auth/signup` | POST | Yes |
| `/api/auth/claimable-tasks` | GET | Yes |
| `/api/mcp` | POST | No (auth via bearer) |
| `/api/mcp/jsonrpc` | POST | No (auth via bearer) |
| All other `/api/*` | * | No |

The `@Public()` decorator uses `SetMetadata('isPublic', true)` and `AuthGuard` checks it via `reflector`.

### 10.4 Admin-Only Guard

A second guard, `AdminGuard`, extends `AuthGuard` and additionally checks `request.user.role === 'admin'`. Applied to:

- `POST /api/auth/invite`
- `GET /api/auth/invites`
- `DELETE /api/auth/invite/:id`
- `POST /api/auth/bot-token`
- `PUT /api/settings`

Implemented as a custom decorator `@AdminOnly()` using `SetMetadata('roles', ['admin'])`, checked by a combined `AuthGuard` that also validates roles.

---

## 11. Security Considerations

### 11.1 Password Hashing

- Algorithm: **bcrypt** via `bcryptjs` package (pure JS, no native compilation issues).
- Cost factor: **12** (reasonable for a local app; ~250ms on modern hardware).
- Passwords are never logged, never included in API responses, never stored in plaintext.

### 11.2 Token Generation

- Session tokens: `crypto.randomUUID()` (v4 UUID, 122 bits of entropy).
- Invite tokens: `crypto.randomUUID()` (same).
- No JWT. Tokens are opaque strings looked up in the database. This is simpler and allows instant revocation without secret rotation concerns.

### 11.3 Session Cleanup

A NestJS `@Cron(CronExpression.EVERY_DAY_AT_3AM)` task:

```typescript
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async cleanupSessions() {
  await this.prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null, lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  await this.prisma.inviteToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });
}
```

### 11.4 Rate Limiting on Login

Use `@nestjs/throttler` with strict limits on auth endpoints:

- `POST /api/auth/login`: 5 requests per minute per IP.
- `POST /api/auth/onboard`: 3 requests per minute per IP.
- `POST /api/auth/signup`: 5 requests per minute per IP.
- All other endpoints: 100 requests per minute per IP.

```typescript
// app.module.ts
ThrottlerModule.forRoot([
  { name: 'auth', ttl: 60000, limit: 5 },
  { name: 'default', ttl: 60000, limit: 100 },
]),
```

Apply `@Throttle('auth')` to auth endpoints and `@Throttle('default')` to others.

### 11.5 Password Validation

- Minimum: 6 characters.
- No maximum (bcrypt truncates at 72 bytes anyway).
- No complexity requirements in V1 (no uppercase, number, special character requirements).
- Server-side validation via `class-validator`: `@IsString()`, `@MinLength(6)`.

### 11.6 Email Normalization

- Store emails as-is (preserving case in the display).
- Compare emails case-insensitively for login and uniqueness checks.
- Use `LOWER(email)` in Prisma raw queries for lookups, or normalize to lowercase before comparison in the service.

### 11.7 CORS

The existing CORS config (`origin: process.env.CORS_ORIGIN || '*'`) remains. For a local/trusted app, this is acceptable. If deployed publicly, the `CORS_ORIGIN` env var should be set to the web app's origin.

### 11.8 No Password Reset in V1

Password reset requires email infrastructure (SMTP or a third-party service). For V1, passwords can only be changed via:

- `PUT /api/auth/password` (requires current password).
- A future CLI command for admin-forced resets.
- Direct database manipulation for recovery scenarios.

### 11.9 Input Validation

All DTOs use `class-validator` decorators with `whitelist: true` (already configured globally in `main.ts`). This prevents unknown properties from being persisted. The `ValidationPipe` is already set up with `{ transform: true, whitelist: true }`.

### 11.10 SQL Injection

Prisma's parameterized queries prevent SQL injection. The MCP service uses raw `params` from JSON-RPC but always passes them through Prisma's query methods, not raw SQL.

---

## Appendix A: Seed Script for First User

A CLI command for programmatic first-user creation (useful for automated deployments):

```bash
pnpm --filter @taskforge/api cli:seed --email admin@example.com --password secret123 --displayName Admin
```

Implementation: a standalone script (`apps/api/src/cli/seed.ts`) using Prisma directly:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv.find(a => a.startsWith('--email='))?.split('=')[1];
  const password = process.argv.find(a => a.startsWith('--password='))?.split('=')[1];
  const displayName = process.argv.find(a => a.startsWith('--displayName='))?.split('=')[1];

  if (!email || !password || !displayName) {
    console.error('Usage: seed --email=X --password=X --displayName=X');
    process.exit(1);
  }

  const settings = await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', onboarded: true },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists:', existing.id);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName,
      role: 'admin',
    },
  });

  console.log('Created admin user:', user.id);
}

main().finally(() => prisma.$disconnect());
```

---

## Appendix B: API Endpoint Summary (Complete)

### Auth Endpoints

| Method | Path | Auth | Role | Handler |
|--------|------|------|------|---------|
| `GET` | `/api/auth/status` | No | — | Check onboarding status |
| `POST` | `/api/auth/onboard` | No | — | Create first admin + settings |
| `GET` | `/api/auth/claimable-tasks?displayName=X` | No | — | List claimable tasks |
| `POST` | `/api/auth/login` | No | — | Login |
| `POST` | `/api/auth/signup` | No | — | Signup with invite token |
| `GET` | `/api/auth/me` | Yes | — | Get current user |
| `POST` | `/api/auth/logout` | Yes | — | Revoke current session |
| `POST` | `/api/auth/logout-all` | Yes | — | Revoke all other sessions |
| `PUT` | `/api/auth/password` | Yes | — | Change password |
| `PUT` | `/api/auth/profile` | Yes | — | Update display name |
| `POST` | `/api/auth/invite` | Yes | admin | Create invite token |
| `GET` | `/api/auth/invites` | Yes | admin | List invite tokens |
| `DELETE` | `/api/auth/invite/:id` | Yes | admin | Delete invite token |
| `POST` | `/api/auth/bot-token` | Yes | admin | Create MCP bot token |

### Settings Endpoints

| Method | Path | Auth | Role | Handler |
|--------|------|------|------|---------|
| `GET` | `/api/settings` | Yes | — | Get instance settings |
| `PUT` | `/api/settings` | Yes | admin | Update instance settings |

### Existing Endpoints (Modified)

All require authentication. `author`/`assignee` field semantics change as described in §5.4.

---

## Appendix C: Frontend Route Summary

| Path | Component | Auth | Redirect If |
|------|-----------|------|-------------|
| `/onboarding` | `OnboardingPage` | No | → `/login` if `onboarded === true` |
| `/login` | `LoginPage` | No | → `/` if already authenticated |
| `/signup/:token` | `SignupPage` | No | → `/login` if token invalid |
| `/` | `HomePage` | Yes | → `/login` if unauthenticated |
| `/board/:id` | `KanbanBoard` | Yes | → `/login` if unauthenticated |
| `/tasks` | `TasksPage` | Yes | → `/login` if unauthenticated |
| `/settings` | `SettingsPage` | Yes | → `/login` if unauthenticated |
| `/account` | `AccountPage` | Yes | → `/login` if unauthenticated |

**App startup flow**:
1. `AuthProvider` calls `GET /api/auth/status`.
2. If `onboarded === false` and no token → redirect to `/onboarding`.
3. If `onboarded === true` and no token → redirect to `/login`.
4. If `onboarded === true` and valid token → load app.
5. If `onboarded === true` and expired token → clear token, redirect to `/login`.