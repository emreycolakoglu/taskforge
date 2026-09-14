# Forgot Password via Email (TFG-49)

## Goal

Let a user who has forgotten their password request a reset link by email, set a new
password from that link, and sign back in. Builds on the SMTP infrastructure delivered in
TFG-48.

## Context

- Auth is invite-only; there is no self-service signup. Sessions are opaque
  `crypto.randomUUID()` tokens stored as plaintext rows in `sessions`.
- `MailerService` (over nodemailer) and admin-configured SMTP settings already exist.
  `AuthService.createInvite` is the closest existing pattern: build a link from
  `APP_ORIGIN`, `await mailer.send(...)`, persist only on success.
- `AuthService` already injects `PrismaService`, `MailerService`, and `SettingsService`.
- Password hashing is bcrypt cost 12.

## Decisions

| Question      | Decision                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Token storage | Store `sha256(rawToken)`; raw 32-byte token only in the email link. Single-use, 1h expiry.                         |
| Post-reset    | Revoke **all** live sessions (including bots), then send the user to `/login`. No auto-login.                      |
| Enumeration   | `POST /forgot-password` always returns `{ success: true }`, whether or not the email exists or SMTP is configured. |
| Abuse         | Invalidate prior tokens on each new request **and** a 60s per-user cooldown.                                       |
| Placement     | Extend `AuthService`/`AuthController` (mirrors the invite flow). No new module.                                    |

## Data model

New model in `apps/api/prisma/schema.prisma`:

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  usedAt    DateTime?
  expiresAt DateTime
  createdAt DateTime  @default(now())

  @@index([userId])
  @@map("password_reset_tokens")
}
```

Add `passwordResets PasswordResetToken[]` to `User`.

Migration: `pnpm --filter @taskforge/api prisma:migrate -- --name password_resets`.

`SessionCleanupService.cleanupSessions` gains two `deleteMany` calls: expired reset tokens
and used reset tokens.

## API

Two new `@Public()` routes in `auth.controller.ts`, DTOs in `auth/dto/`.

### `POST /api/auth/forgot-password`

Body: `{ email: string }`. Always responds `200 { success: true }`.

Logic in `AuthService.requestPasswordReset(email)`:

1. Normalize with `.toLowerCase().trim()` (matches `login`).
2. Look up the user. If none, return.
3. Cooldown: if the newest reset token for the user has `createdAt > now - 60s`, return
   without sending (still success).
4. `deleteMany` all existing reset tokens for the user (only the latest link works).
5. Generate a raw token (`crypto.randomBytes(32).toString('hex')`); store
   `sha256(raw)` with `expiresAt = now + 1h`.
6. If `mailer.isConfigured()`, send email with link
   `${APP_ORIGIN ?? 'http://localhost:5173'}/reset-password/${raw}`. Send failures are
   logged and swallowed — the response stays generic.

### `POST /api/auth/reset-password`

Body: `{ token: string, password: string }`.

Logic in `AuthService.resetPassword(token, password)`:

1. `sha256(token)` → look up unused (`usedAt: null`) row. Missing, used, or expired all
   raise `BadRequestException('Invalid or expired reset token')` — no distinguishing oracle.
2. Validate `password.length >= 6` (same floor as the signup page).
3. In one `$transaction`:
   - `bcrypt.hash(password, 12)` → update `user.passwordHash`;
   - set the reset token's `usedAt`;
   - delete all other reset tokens for the user;
   - `session.updateMany({ where: { userId }, data: { revokedAt: now } })` — revoke all,
     bots included.
4. Return `{ success: true }`.

## Web

- `hooks/api.ts` → `api.auth.forgotPassword(email)` and `api.auth.resetPassword(token, password)`.
- `pages/forgot-password-page.tsx`: email field; on submit always shows the generic
  confirmation ("If an account exists for that email, a reset link is on its way."). One
  Lime CTA.
- `pages/reset-password-page.tsx`: new + confirm password (mirror signup validation:
  match, min 6); on success navigate to `/login`. Invalid/expired token surfaces the API
  message inline.
- Both mounted in `app.tsx` above `AuthProvider`, like `/login` and `/signup/:token`, so no
  redirect or `/auth/status` call touches them.
- `login-page.tsx` gains a "Forgot password?" link to `/forgot-password`.
- Styling per `design.md` (Obsidian/Charcoal card, border-defined, single Lime CTA, Inter
  ≤590, JetBrains Mono for the token if shown).

## Tests

API (`auth.service.spec.ts`):

- Unknown email → generic success, no token row.
- Known email → token row exists; stored value is the hash, not the raw token.
- Second request within 60s → no second send.
- Expired token rejected; already-used token rejected; unknown token rejected — all the
  same message.
- Successful reset changes the password hash, marks the token used, deletes sibling
  tokens, and revokes every session for the user.

Web:

- API-client assertions for `forgotPassword` and `resetPassword` request shapes.

## Out of scope (follow-ups)

- Rate limiting beyond the 60s cooldown / IP-based throttling.
- A dedicated "link expired" landing experience (the reset page just shows the API error).
- "Your password was changed" notification email.
