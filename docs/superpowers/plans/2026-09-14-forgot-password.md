# Forgot Password via Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user request a password-reset link by email, set a new password from it, and sign back in.

**Architecture:** Extend `AuthService`/`AuthController` with two `@Public()` routes — `forgot-password` (always returns generic success, stores a SHA-256 hash of a 32-byte token, emails a link) and `reset-password` (looks up the hashed token, updates the bcrypt hash, marks the token used, and revokes every session for the user in one transaction). Two new public web pages extend `AuthProvider`'s existing public-route escape hatch.

**Tech Stack:** NestJS 11, Prisma 6 (SQLite), nodemailer via `MailerService`, class-validator DTOs, React 19 + Vite + React Router, Vitest, Jest.

**Spec:** `docs/superpowers/specs/2026-09-14-forgot-password-design.md`

## Global Constraints

- Token is 32 random bytes hex; stored only as `sha256(raw)`; single-use; 1h expiry.
- `POST /api/auth/forgot-password` ALWAYS responds `200 { success: true }` — unknown email, cooldown, and SMTP-unconfigured all look identical.
- Per-user 60s cooldown: a second request inside 60s sends nothing (still success).
- On reset: revoke ALL sessions for the user (bots included), mark token used, delete sibling tokens.
- Invalid / used / expired token all raise `BadRequestException('Invalid or expired reset token')`.
- Password floor is 6 characters (same as the signup page).
- API is CommonJS + `strict: false`; web is ESM + `strict: true`. Never copy imports between apps.
- Email link origin: `process.env.APP_ORIGIN ?? 'http://localhost:5173'`, path `/reset-password/<rawToken>`.
- Password hashing is bcrypt cost 12.
- Do not add ESLint config; `pnpm lint` is known-broken. The API uses `strict: false` deliberately.
- No comments in code unless the _why_ is non-obvious. Prettier is canonical.

---

### Task 1: `PasswordResetToken` model + migration

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_password_resets/migration.sql` (generated)
- Modify: `apps/api/src/auth/session-cleanup.service.ts`

**Interfaces:**

- Produces: Prisma client gains `prisma.passwordResetToken` with fields `id, tokenHash, userId, usedAt, expiresAt, createdAt`.

- [ ] **Step 1: Add the model and User relation**

In `apps/api/prisma/schema.prisma`, add `passwordResets PasswordResetToken[]` to the `User` model (next to the other relations, before `@@map("users")`):

```prisma
  passwordResets PasswordResetToken[] @relation("PasswordResets")
```

Then add the model after `InviteToken` (before `Board`):

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation("PasswordResets", fields: [userId], references: [id], onDelete: Cascade)
  usedAt    DateTime?
  expiresAt DateTime
  createdAt DateTime  @default(now())

  @@index([userId])
  @@map("password_reset_tokens")
}
```

The `@relation("PasswordResets")` name is required because `User` already has two `InviteToken` relations and Prisma must disambiguate this third one.

- [ ] **Step 2: Generate the migration and client**

Run from the repo root:

```bash
pnpm --filter @taskforge/api prisma:migrate -- --name password_resets
pnpm --filter @taskforge/api prisma:generate
```

Expected: a new `apps/api/prisma/migrations/*_password_resets/migration.sql` containing `CREATE TABLE "password_reset_tokens"`, and Prisma client regeneration succeeds.

- [ ] **Step 3: Add cleanup of expired/used reset tokens**

In `apps/api/src/auth/session-cleanup.service.ts`, inside `cleanupSessions()`, after the `usedInvites` deleteMany:

```ts
const expiredResets = await this.prisma.passwordResetToken.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});

const usedResets = await this.prisma.passwordResetToken.deleteMany({
  where: { usedAt: { not: null } },
});
```

And extend the final `this.logger.log(...)` template with:

```ts
`${expiredResets.count} expired resets, ${usedResets.count} used resets`;
```

- [ ] **Step 4: Verify it compiles and existing tests still pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.service
```

Expected: PASS (existing auth tests unaffected; the new table is unused so far).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/auth/session-cleanup.service.ts
git commit -m "feat(api): password_reset_tokens model and cleanup"
```

---

### Task 2: `AuthService.requestPasswordReset`

**Files:**

- Create: `apps/api/src/auth/dto/forgot-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**

- Consumes: `prisma.passwordResetToken` (Task 1); injected `mailer: MailerService`, `settings: SettingsService`.
- Produces: `AuthService.requestPasswordReset(email: string): Promise<{ success: true }>`.

- [ ] **Step 1: Create the DTO**

`apps/api/src/auth/dto/forgot-password.dto.ts`:

```ts
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/auth/auth.service.spec.ts`, extend the `afterEach` cleanup list — add `await prisma.passwordResetToken.deleteMany();` as the FIRST line.

Add a `describe('requestPasswordReset', ...)` block inside the top-level `describe`. First add this import at the top of the file:

```ts
import * as crypto from 'crypto';
```

Then the block:

```ts
describe('requestPasswordReset', () => {
  const resetUrl = () =>
    (mailer.send as jest.Mock).mock.calls.at(-1)?.[0]?.html as string | undefined;

  it('returns generic success for an unknown email without writing a row', async () => {
    const result = await service.requestPasswordReset('nobody@example.com');
    expect(result).toEqual({ success: true });
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('stores only the SHA-256 hash of the emailed token', async () => {
    const user = await seedUser(prisma, { email: 'reset@example.com' });
    await service.requestPasswordReset('RESET@example.com ');

    const row = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    const html = resetUrl()!;
    const raw = html.match(/reset-password\/([a-f0-9]+)/)![1];

    expect(row.tokenHash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
    expect(row.tokenHash).not.toBe(raw);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('suppresses a second send inside the 60s cooldown', async () => {
    const user = await seedUser(prisma, { email: 'cooldown@example.com' });
    await service.requestPasswordReset('cooldown@example.com');
    expect(mailer.send).toHaveBeenCalledTimes(1);

    const result = await service.requestPasswordReset('cooldown@example.com');
    expect(result).toEqual({ success: true });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('allows a new send once the cooldown has elapsed and replaces the old token', async () => {
    const user = await seedUser(prisma, { email: 'again@example.com' });
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: crypto.createHash('sha256').update('old').digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
      },
    });
    mailer.send.mockClear();

    await service.requestPasswordReset('again@example.com');

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(crypto.createHash('sha256').update('old').digest('hex'));
  });

  it('still returns success when SMTP is not configured', async () => {
    await seedUser(prisma, { email: 'nosmtp@example.com' });
    mailer.isConfigured.mockResolvedValueOnce(false);

    const result = await service.requestPasswordReset('nosmtp@example.com');

    expect(result).toEqual({ success: true });
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
```

Note: `seedUser` is already imported (add it to the `../../test/setup` import if the file's import only lists `createTestPrisma, seedBoard`).

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.service
```

Expected: FAIL — `service.requestPasswordReset is not a function`.

- [ ] **Step 4: Implement the method**

In `apps/api/src/auth/auth.service.ts`, add a module-level constant below the imports:

```ts
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
```

Add the method after `login`:

```ts
  /**
   * Always resolves to the same shape: callers must not be able to tell whether
   * the email exists, whether a cooldown suppressed the send, or whether SMTP is
   * configured. See the design note in the spec.
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      return { success: true };
    }

    const newest = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (newest && newest.createdAt.getTime() > Date.now() - RESET_COOLDOWN_MS) {
      return { success: true };
    }

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    if (!(await this.mailer.isConfigured())) {
      return { success: true };
    }

    const title = await this.settings.getTitle();
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
    const link = `${origin}/reset-password/${rawToken}`;
    try {
      await this.mailer.send({
        to: user.email,
        subject: `Reset your ${title} password`,
        html: `<p>Someone requested a password reset for your <strong>${title}</strong> account.</p><p><a href="${link}">Set a new password</a> — the link expires in 1 hour. If this wasn't you, ignore this email.</p>`,
        text: `Reset your ${title} password: ${link} (expires in 1 hour).`,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to send password reset email: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { success: true };
  }
```

Add a logger field to the class (next to the constructor):

```ts
  private readonly logger = new Logger(AuthService.name);
```

and add `Logger` to the `@nestjs/common` import list.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): request password reset by email"
```

---

### Task 3: `AuthService.resetPassword`

**Files:**

- Create: `apps/api/src/auth/dto/reset-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**

- Consumes: `requestPasswordReset` (Task 2) for producing a token in tests.
- Produces: `AuthService.resetPassword(token: string, password: string): Promise<{ success: true }>`.

- [ ] **Step 1: Create the DTO**

`apps/api/src/auth/dto/reset-password.dto.ts`:

```ts
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

- [ ] **Step 2: Write the failing tests**

Add a `describe('resetPassword', ...)` block in `auth.service.spec.ts`. Use this helper to obtain a raw token by driving `requestPasswordReset` and parsing the emailed link:

```ts
describe('resetPassword', () => {
  async function tokenFor(email: string): Promise<{ raw: string; userId: string }> {
    const user = await seedUser(prisma, { email });
    await service.requestPasswordReset(email);
    const html = (mailer.send as jest.Mock).mock.calls.at(-1)![0].html as string;
    const raw = html.match(/reset-password\/([a-f0-9]+)/)![1];
    return { raw, userId: user.id };
  }

  beforeEach(() => {
    mailer.send.mockClear();
    (mailer.isConfigured as jest.Mock).mockResolvedValue(true);
  });

  it('rejects an unknown token with the generic message', async () => {
    await expect(service.resetPassword('deadbeef', 'newpassword')).rejects.toThrow(
      'Invalid or expired reset token',
    );
  });

  it('rejects an expired token', async () => {
    const { raw, userId } = await tokenFor('expired@example.com');
    await prisma.passwordResetToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(service.resetPassword(raw, 'newpassword')).rejects.toThrow(
      'Invalid or expired reset token',
    );
  });

  it('rejects an already-used token', async () => {
    const { raw, userId } = await tokenFor('used@example.com');
    await prisma.passwordResetToken.updateMany({
      where: { userId },
      data: { usedAt: new Date() },
    });
    await expect(service.resetPassword(raw, 'newpassword')).rejects.toThrow(
      'Invalid or expired reset token',
    );
  });

  it('rejects a password shorter than 6 characters', async () => {
    const { raw } = await tokenFor('short@example.com');
    await expect(service.resetPassword(raw, 'abc')).rejects.toThrow(BadRequestException);
  });

  it('changes the password, consumes the token, and revokes every session', async () => {
    const { raw, userId } = await tokenFor('ok@example.com');
    const bcrypt = require('bcryptjs');
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const live = await prisma.session.create({
      data: { token: crypto.randomUUID(), userId, expiresAt: new Date(Date.now() + 1e6) },
    });
    const bot = await prisma.session.create({
      data: {
        token: crypto.randomUUID(),
        userId,
        bot: true,
        expiresAt: new Date(Date.now() + 1e6),
      },
    });
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: crypto.createHash('sha256').update('sibling').digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const result = await service.resetPassword(raw, 'newpassword');

    expect(result).toEqual({ success: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await bcrypt.compare('newpassword', after.passwordHash)).toBe(true);

    const used = await prisma.passwordResetToken.findMany({ where: { userId } });
    expect(used).toHaveLength(1);
    expect(used[0].usedAt).not.toBeNull();

    for (const id of [live.id, bot.id]) {
      const s = await prisma.session.findUniqueOrThrow({ where: { id } });
      expect(s.revokedAt).not.toBeNull();
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.service
```

Expected: FAIL — `service.resetPassword is not a function`.

- [ ] **Step 4: Implement the method**

Add to `apps/api/src/auth/auth.service.ts`, after `requestPasswordReset`:

```ts
  async resetPassword(token: string, password: string): Promise<{ success: true }> {
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: row.userId, id: { not: row.id } },
      }),
      this.prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    return { success: true };
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): reset password from emailed token"
```

---

### Task 4: Public auth routes

**Files:**

- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.controller.spec.ts` (create)

**Interfaces:**

- Consumes: `AuthService.requestPasswordReset`, `AuthService.resetPassword` (Tasks 2–3).
- Produces: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` (both `@Public()`).

- [ ] **Step 1: Write the failing controller test**

Create `apps/api/src/auth/auth.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

describe('AuthController password reset routes', () => {
  let controller: AuthController;
  const authService = {
    requestPasswordReset: jest.fn().mockResolvedValue({ success: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('delegates forgot-password to the service', async () => {
    const dto: ForgotPasswordDto = { email: 'a@b.com' };
    await expect(controller.forgotPassword(dto)).resolves.toEqual({ success: true });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith('a@b.com');
  });

  it('delegates reset-password to the service', async () => {
    const dto: ResetPasswordDto = { token: 'raw', password: 'newpassword' };
    await expect(controller.resetPassword(dto)).resolves.toEqual({ success: true });
    expect(authService.resetPassword).toHaveBeenCalledWith('raw', 'newpassword');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth.controller
```

Expected: FAIL — `controller.forgotPassword is not a function`.

- [ ] **Step 3: Add the routes**

In `apps/api/src/auth/auth.controller.ts`, add imports:

```ts
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
```

Add the two handlers after `login`:

```ts
  @Post('forgot-password')
  @Public()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @Public()
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @taskforge/api test -- --testPathPatterns=auth
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): public forgot/reset password routes"
```

---

### Task 5: Web API client

**Files:**

- Modify: `apps/web/src/hooks/api.ts`
- Test: `apps/web/src/hooks/api.test.ts`

**Interfaces:**

- Produces: `api.auth.forgotPassword(email: string): Promise<{ success: boolean }>`, `api.auth.resetPassword(token: string, password: string): Promise<{ success: boolean }>`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/hooks/api.test.ts`, add a block inside the top-level `describe('api', ...)`. Match the existing style (dynamic import, `mockFetch.mockResolvedValueOnce`, assert on the call):

```ts
it('posts to forgot-password with the email', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });
  const { api } = await import('./api');

  const result = await api.auth.forgotPassword('a@b.com');

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/auth/forgot-password',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com' }),
    }),
  );
  expect(result).toEqual({ success: true });
});

it('posts to reset-password with token and password', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });
  const { api } = await import('./api');

  const result = await api.auth.resetPassword('raw-token', 'newpassword');

  expect(mockFetch).toHaveBeenCalledWith(
    '/api/auth/reset-password',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token', password: 'newpassword' }),
    }),
  );
  expect(result).toEqual({ success: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd apps/web && npx vitest run src/hooks/api.test.ts
```

Expected: FAIL — `api.auth.forgotPassword is not a function`.

- [ ] **Step 3: Add the client methods**

In `apps/web/src/hooks/api.ts`, inside `api.auth`, after `login`:

```ts
    forgotPassword: (email: string) =>
      request<{ success: boolean }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ success: boolean }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),
```

- [ ] **Step 4: Run to verify it passes**

Run:

```bash
cd apps/web && npx vitest run src/hooks/api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/api.ts apps/web/src/hooks/api.test.ts
git commit -m "feat(web): forgot/reset password API client"
```

---

### Task 6: Public-route escape hatch in AuthProvider

**Files:**

- Modify: `apps/web/src/contexts/auth-context.tsx`
- Test: `apps/web/src/contexts/auth-context.test.tsx`

**Interfaces:**

- Produces: behavior — unauthenticated visitors to `/forgot-password` and `/reset-password/:token` are NOT redirected to `/login`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/contexts/auth-context.test.tsx`, next to the existing `/signup/` case (inside `describe('AuthProvider init redirects', ...)`):

```ts
it('stays on the forgot-password page when onboarded and unauthenticated', async () => {
  setPath('/forgot-password');
  renderProvider();

  await waitFor(() => expect(api.auth.status).toHaveBeenCalled());
  expect(navigate).not.toHaveBeenCalledWith('/login', { replace: true });
});

it('stays on the reset-password page when onboarded and unauthenticated', async () => {
  setPath('/reset-password/abc123');
  renderProvider();

  await waitFor(() => expect(api.auth.status).toHaveBeenCalled());
  expect(navigate).not.toHaveBeenCalledWith('/login', { replace: true });
});
```

- [ ] **Step 2: Run to verify they fail**

Run:

```bash
cd apps/web && npx vitest run src/contexts/auth-context.test.tsx
```

Expected: FAIL — both new cases receive a `/login` redirect.

- [ ] **Step 3: Replace the single route check with a predicate**

In `apps/web/src/contexts/auth-context.tsx`, above `AuthProvider`, add:

```ts
/**
 * Routes that render without a session. AuthProvider's init effect runs on every
 * mount, so an unauthenticated visitor on one of these must not be bounced to
 * /login before they can use the page.
 */
function isPublicAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/signup/') ||
    pathname === '/forgot-password' ||
    pathname.startsWith('/reset-password/')
  );
}
```

Then in the `init` effect, replace the existing:

```ts
const onSignupRoute = window.location.pathname.startsWith('/signup/');
```

with:

```ts
const onPublicAuthRoute = isPublicAuthRoute(window.location.pathname);
```

and replace both `if (!onSignupRoute)` occurrences with `if (!onPublicAuthRoute)`.

- [ ] **Step 4: Run the whole context test file**

Run:

```bash
cd apps/web && npx vitest run src/contexts/auth-context.test.tsx
```

Expected: PASS (including the pre-existing signup case).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/contexts/auth-context.tsx apps/web/src/contexts/auth-context.test.tsx
git commit -m "feat(web): treat forgot/reset routes as public in AuthProvider"
```

---

### Task 7: Forgot-password page + login link + route wiring

**Files:**

- Create: `apps/web/src/pages/forgot-password-page.tsx`
- Modify: `apps/web/src/pages/login-page.tsx`
- Modify: `apps/web/src/app.tsx`
- Test: `apps/web/src/pages/forgot-password-page.test.tsx` (create)

**Interfaces:**

- Consumes: `api.auth.forgotPassword` (Task 5).
- Produces: `ForgotPasswordPage` component; route `/forgot-password`.

- [ ] **Step 1: Write the failing page test**

Create `apps/web/src/pages/forgot-password-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const forgotPassword = vi.fn();
vi.mock('@/hooks/api', () => ({
  api: { auth: { forgotPassword } },
}));

import { ForgotPasswordPage } from './forgot-password-page';

describe('ForgotPasswordPage', () => {
  beforeEach(() => forgotPassword.mockReset());

  it('shows the generic confirmation for any email', async () => {
    forgotPassword.mockResolvedValue({ success: true });
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/if an account exists/i)).toBeTruthy());
    expect(forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('still shows the confirmation when the request rejects', async () => {
    forgotPassword.mockRejectedValue(new Error('boom'));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByText(/if an account exists/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd apps/web && npx vitest run src/pages/forgot-password-page.test.tsx
```

Expected: FAIL — cannot resolve `./forgot-password-page`.

- [ ] **Step 3: Create the page**

`apps/web/src/pages/forgot-password-page.tsx` — mirror the login/signup card shell (`Card`, `Input`, `Button`, `Label`, exactly one Lime CTA). Link back to `/login`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/hooks/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.auth.forgotPassword(email);
    } catch {
      // Deliberately swallowed — the response is the same either way.
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl p-6 space-y-4 rounded-xl">
        <CardHeader className="text-center space-y-2 p-0">
          <CardTitle className="text-lg font-medium tracking-tight text-foreground">
            Reset Password
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            We'll email you a link to set a new password
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {submitted ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, a reset link is on its way.
              </p>
              <Link to="/login" className="text-sm text-primary hover:underline text-center">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full mt-2">
                {submitting ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:underline text-center"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

Note: the test queries `getByLabelText('Email')`. Keep the `Label htmlFor="email"` + `Input id="email"` pairing exactly as shown so it resolves.

- [ ] **Step 4: Add a "Forgot password?" link to the login page**

In `apps/web/src/pages/login-page.tsx`, add `import { Link } from 'react-router-dom';` (merge with the existing react-router import) and place this directly under the password field's closing `</div>`, before the `{error && ...}` line:

```tsx
<div className="flex justify-end">
  <Link to="/forgot-password" className="text-sm text-muted-foreground hover:underline">
    Forgot password?
  </Link>
</div>
```

- [ ] **Step 5: Mount the route**

In `apps/web/src/app.tsx`, add the import next to `LoginPage`:

```ts
import { ForgotPasswordPage } from '@/pages/forgot-password-page';
```

Add the route right after `/login` (inside the `AuthProvider`'s `<Routes>`, so `SidebarLayout` is NOT applied):

```tsx
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
cd apps/web && npx vitest run src/pages/forgot-password-page.test.tsx src/contexts/auth-context.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/forgot-password-page.tsx apps/web/src/pages/forgot-password-page.test.tsx apps/web/src/pages/login-page.tsx apps/web/src/app.tsx
git commit -m "feat(web): forgot password page and login link"
```

---

### Task 8: Reset-password page + route wiring

**Files:**

- Create: `apps/web/src/pages/reset-password-page.tsx`
- Modify: `apps/web/src/app.tsx`
- Test: `apps/web/src/pages/reset-password-page.test.tsx` (create)

**Interfaces:**

- Consumes: `api.auth.resetPassword` (Task 5); `useParams<{ token: string }>`.
- Produces: `ResetPasswordPage` component; route `/reset-password/:token`.

- [ ] **Step 1: Write the failing page test**

Create `apps/web/src/pages/reset-password-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resetPassword = vi.fn();
const navigate = vi.fn();
vi.mock('@/hooks/api', () => ({
  api: { auth: { resetPassword } },
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'raw-token' }),
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ResetPasswordPage } from './reset-password-page';

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirm } });
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    resetPassword.mockReset();
    navigate.mockReset();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    render(<ResetPasswordPage />);
    fill('newpassword', 'different');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeTruthy());
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('surfaces the API error for an invalid token', async () => {
    resetPassword.mockRejectedValue(new Error('Invalid or expired reset token'));
    render(<ResetPasswordPage />);
    fill('newpassword', 'newpassword');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired reset token/i)).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('resets and navigates to /login on success', async () => {
    resetPassword.mockResolvedValue({ success: true });
    render(<ResetPasswordPage />);
    fill('newpassword', 'newpassword');
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('raw-token', 'newpassword'));
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:

```bash
cd apps/web && npx vitest run src/pages/reset-password-page.test.tsx
```

Expected: FAIL — cannot resolve `./reset-password-page`.

- [ ] **Step 3: Create the page**

`apps/web/src/pages/reset-password-page.tsx` — same card shell, validation mirrors `signup-page.tsx` (match + min 6), error rendered inline:

```tsx
import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/hooks/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (!token) {
      setError('Invalid or expired reset token');
      return;
    }

    setSubmitting(true);
    try {
      await api.auth.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl p-6 space-y-4 rounded-xl">
        <CardHeader className="text-center space-y-2 p-0">
          <CardTitle className="text-lg font-medium tracking-tight text-foreground">
            Set New Password
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Choose a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full mt-2">
              {submitting ? 'Saving...' : 'Set New Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Mount the route**

In `apps/web/src/app.tsx`, add the import next to `ForgotPasswordPage`:

```ts
import { ResetPasswordPage } from '@/pages/reset-password-page';
```

Add the route right after `/forgot-password` (again outside `SidebarLayout`):

```tsx
<Route path="/reset-password/:token" element={<ResetPasswordPage />} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
cd apps/web && npx vitest run src/pages/reset-password-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/reset-password-page.tsx apps/web/src/pages/reset-password-page.test.tsx apps/web/src/app.tsx
git commit -m "feat(web): reset password page"
```

---

### Task 9: Docs + full verification

**Files:**

- Modify: `AGENTS.md`

**Interfaces:**

- Produces: accurate documentation of the public auth surface.

- [ ] **Step 1: Update the public-surface note in `AGENTS.md`**

In the **Gotchas** section, the bullet beginning "**Authentication is global and on by default**" lists the public surface. Change its enumeration to include the two new routes:

```
  The public surface is small and deliberate:
  `auth/status`, `auth/onboard`, `auth/login`, `auth/forgot-password`,
  `auth/reset-password`, `auth/signup/:token`, two settings routes, and
  `public/tasks/:identifier/:number`.
```

Then add a new subsection after the **Email (SMTP)** section:

```markdown
## Password reset

`POST /api/auth/forgot-password` always returns `{ success: true }` — unknown
email, the 60s per-user cooldown, and an unconfigured SMTP server are
indistinguishable from the outside. Reset tokens are stored as `sha256(raw)` in
`password_reset_tokens`, single-use, 1h expiry; the raw token exists only in the
emailed link (`${APP_ORIGIN}/reset-password/<token>`). A successful reset
(`POST /api/auth/reset-password`) revokes **every** session for the user —
bots included — so no pre-existing session survives a password change. The
web pages (`/forgot-password`, `/reset-password/:token`) are public routes and
ride `AuthProvider`'s `isPublicAuthRoute` escape hatch.
```

- [ ] **Step 2: Run the full API test suite**

Run:

```bash
pnpm --filter @taskforge/api test
```

Expected: PASS (0 failures).

- [ ] **Step 3: Run the full web test suite**

Run:

```bash
pnpm --filter @taskforge/web test
```

Expected: PASS (0 failures).

- [ ] **Step 4: Typecheck the web app (the build does NOT typecheck it)**

Run:

```bash
cd apps/web && npx tsc --noEmit
```

Expected: **6** pre-existing errors, unchanged. If the count grew, fix the new ones.

- [ ] **Step 5: Check formatting**

Run:

```bash
pnpm format:check
```

Expected: no files flagged. If new files are flagged, run `pnpm format` and re-commit.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document password reset flow"
```

---

## Self-Review

**Spec coverage:**

- Token storage (hashed, single-use, 1h) → Task 1 (schema) + Tasks 2–3.
- Post-reset revokes all sessions + go to login → Task 3 (`session.updateMany`) + Task 8 (navigate `/login`).
- Generic response for unknown email / SMTP-unconfigured → Task 2 + its tests.
- 60s cooldown + invalidate prior tokens → Task 2 + tests.
- Model/migration/cleanup → Task 1.
- Two public routes + DTOs → Tasks 2–4.
- Web API methods → Task 5.
- Web pages + login link + routing → Tasks 7–8; public-route behavior → Task 6.
- Tests (API + web) → embedded in each task.
- Docs → Task 9.
- Out of scope (rate limiting, expired-link landing, password-changed email) → correctly absent.

**Type consistency:** `requestPasswordReset` and `resetPassword` signatures match across service, controller, and tests; `api.auth.forgotPassword/resetPassword` match between `api.ts` and both page tests. Route paths (`/forgot-password`, `/reset-password/:token`) and the API paths (`/auth/forgot-password`, `/auth/reset-password`) are consistent across tasks.

**Deviations from spec (intentional):** The spec said the pages mount "above AuthProvider"; the codebase actually mounts `/login` and `/signup/:token` _inside_ it with a path escape hatch. Task 6 follows the codebase pattern and generalizes the hatch rather than restructuring `app.tsx`.
