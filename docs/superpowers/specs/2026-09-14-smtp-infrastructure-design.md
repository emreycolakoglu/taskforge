# TFG-48 — SMTP Infrastructure

Date: 2026-09-14
Status: Approved

## Context

TaskForge sends no email today. Invite links are created as `InviteToken` rows and
delivered by copying a URL to the clipboard (`apps/web/src/pages/settings-page.tsx`,
`account-page.tsx`). The only notification system is in-app (`Notification` rows via
`NotificationsService`).

This task adds the mail foundation: admins configure SMTP from the instance settings
panel, and invite links can optionally be emailed. TFG-49 (forgot password) will
consume the same `MailerService` in a follow-up task.

## Decisions (grill-me summary)

| Decision        | Choice                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Scope           | SMTP settings UI/API + optional email delivery of invites + test send. TFG-49 stays separate.    |
| Invite delivery | Email AND clipboard both — clipboard flow untouched, email is additive.                          |
| Config storage  | Fields on the existing `Settings` singleton row (not env vars).                                  |
| Dispatch        | Inline await, no queue/retries. Failures surface to the admin immediately.                       |
| Test send       | "Send test email" action validates the saved config.                                             |
| Password        | Stored plaintext in DB, write-only via API (responses expose `smtpPasswordSet` boolean instead). |
| Mailer          | Dedicated `MailerModule` + `MailerService` over nodemailer.                                      |

## Schema (single Prisma migration)

`Settings` model gains:

- `smtpHost String?`
- `smtpPort Int?`
- `smtpUsername String?`
- `smtpPassword String?`
- `smtpFromEmail String?`
- `smtpFromName String @default("TaskForge")`
- `smtpSecure Boolean @default(true)` — implicit TLS (465). Port 587 with
  `smtpSecure=false` uses STARTTLS via nodemailer's default behavior.

`InviteToken` gains `recipientEmail String?` — set when the invite was emailed;
nullable so clipboard-only invites remain valid.

Migration: `pnpm --filter @taskforge/api prisma:migrate -- --name add-smtp-settings`.

## Mailer module (`apps/api/src/mailer/`)

- `MailerService.send(params: { to, subject, html, text })`:
  - Reads SMTP config from `SettingsService` on each call.
  - Creates a nodemailer transport per call — no long-lived transport to invalidate
    when the admin changes config.
  - Throws `BadRequestException('SMTP is not configured')` when `smtpHost` is unset.
- `MailerService.isConfigured(): boolean` for UI hints.
- Email template: simple HTML wrapper using the instance title (`settings.title`) as
  the brand header; plain content block; text fallback. Invite email body contains the
  full signup URL and the 7-day expiry note.
- Transport errors propagate as-is (message text) to the caller.

`MailerModule` is registered in `AppModule`. Not `@Global()` — consumers import it
explicitly (auth, settings).

## API changes

### Settings (`apps/api/src/settings/`)

- `UpdateSettingsDto` gains the seven SMTP fields. Validation:
  - `smtpPort` integer 1–65535 when present.
  - `smtpFromEmail` valid email format when present.
  - `smtpPassword` write-only: `GET /api/settings` returns `smtpPasswordSet: boolean`
    (true when non-empty) and never the password itself.
  - Password semantics on `PUT`: field absent → unchanged; empty string → clears the
    password; non-empty → sets it. Other SMTP fields follow normal PATCH semantics
    (absent = unchanged, `null` = clear).
- `POST /api/settings/test-email` (`@Admin()`): body `{ to: string }` (validated
  email). Sends a test email via `MailerService` using saved config. On transport
  failure returns 400 with the underlying error message so the admin sees why
  (connection refused, auth failed, TLS mismatch...). Returns 204 on success.
- All settings routes keep their existing gates (`@Admin()` for read/update/test;
  `title` and `initialized` remain `@Public()`).

### Auth invites (`apps/api/src/auth/`)

- `POST /api/auth/invite` (`@Admin()`) accepts optional `recipientEmail` (validated
  email when present).
  - `recipientEmail` present: generate the token string first (`crypto.randomUUID()`),
    send the invite email inline (await), and only then persist the `InviteToken` row.
    SMTP unconfigured → 400 `'SMTP is not configured'`; transport failure → 400 with
    the error message. In both failure cases no row is created (the admin can simply
    retry, no orphan tokens).
  - `recipientEmail` absent: current behavior unchanged (token created, clipboard
    delivery client-side).
- Response includes the invite row (token, `recipientEmail`, `expiresAt`).

## Web changes

### Settings page — new "Email" tab (admin-only, alongside General/Users/Invites)

- Form fields: host, port, username, password, from email, from name, secure toggle.
- Password input: masked; placeholder `••••••` when `smtpPasswordSet`; leaving it
  blank on save = keep existing; explicit "clear password" affordance sends `""`.
- "Send test email" button next to the form: recipient input defaults to the logged-in
  admin's email; calls the test-email route; success toast + failure toast showing the
  server's error message.
- Save writes only the fields the admin touched plus password semantics above.

### Invites tab — "Send by email"

- Create-invite form gains an optional email address input.
- When filled: calls `POST /api/auth/invite { recipientEmail }`; the link is still
  shown/copied to clipboard as today (email is additive).
- When empty: current flow unchanged.
- Invites table shows the recipient email when set.

## Error handling

- Unconfigured SMTP: `BadRequestException('SMTP is not configured')` from both the
  test-email route and emailed invites.
- Transport failures: 400 with nodemailer's error message surfaced verbatim. No
  retries, no queue.
- Invalid recipient/format: standard DTO validation (400) before anything is sent or
  stored.

## Testing

- Settings: SMTP fields round-trip; password write-only (`smtpPasswordSet` exposed,
  secret never returned); password absent/empty/non-empty semantics on PUT.
- Test-email route: unconfigured → 400; configured → sends with saved config
  (transport stubbed); transport failure → 400 with message.
- Invites: with recipientEmail + configured SMTP → email sent, row has recipient;
  with recipientEmail + unconfigured → 400 and no row; without recipientEmail →
  unchanged behavior.
- Mailer: unit test with a stubbed nodemailer transport — send() maps params, throws
  when unconfigured.
- Web: settings Email tab renders and saves (mocked hooks); invite email input flow.

## Out of scope

- Forgot-password emails (TFG-49).
- Notification/comment emails.
- MCP tools for settings or mail.
- Encryption at rest for the SMTP password.
- Invite tokens expiring/re-sending UI.
