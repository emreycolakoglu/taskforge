# Migration Strategy Design

Date: 2026-06-29
Status: Approved (brainstorm)

## Goal

Replace the current `prisma db push`-on-startup approach with `prisma migrate deploy` run from a container entrypoint script, so schema changes ship as migration files and apply non-destructively to existing databases. No legacy baselining — the project has no existing users.

## Context

The current `PrismaService.ensureSchema()` (`apps/api/src/prisma/prisma.service.ts:74-100`) checks if tables exist and runs `prisma db push` only on fresh databases. This means schema changes in new images are never applied to existing databases — the app breaks for returning users. `db push` also has no migration history, so it cannot apply incremental changes safely.

## Architecture

```
docker-entrypoint.sh
  ├─ prisma migrate deploy   (idempotent — no-op if no pending migrations)
  └─ exec node dist/main.js
```

A single entrypoint script runs `prisma migrate deploy` before starting the NestJS app. `migrate deploy` is Prisma's production-safe, non-interactive command: it applies pending migrations in order and is a no-op when nothing is pending. The app process never handles schema management.

## Components

### 1. Initial migration

Create `apps/api/prisma/migrations/` from the current `schema.prisma` via `prisma migrate dev --name init`. This produces a `migration.sql` and a `migration_lock.toml` (marking SQLite as the provider). Both are committed and shipped in the image.

### 2. Entrypoint script

Create `apps/api/docker-entrypoint.sh`:
- `cd` to the app directory (so Prisma can find `schema.prisma` and `migrations/`).
- Run `prisma migrate deploy`.
- `exec node dist/main.js` (replaces the shell process with node, so signals propagate correctly).
- Must be executable (`chmod +x`).

### 3. Dockerfile changes

- Copy `apps/api/docker-entrypoint.sh` into the image.
- Copy `apps/api/prisma/migrations/` into the image (in addition to the existing `apps/api/prisma/` copy).
- Change `CMD ["node", "dist/main.js"]` to `CMD ["./docker-entrypoint.sh"]`.
- The entrypoint runs from `WORKDIR /app/apps/api`, so relative paths to `prisma/` resolve correctly.

### 4. PrismaService changes

Remove the `ensureSchema` method from `apps/api/src/prisma/prisma.service.ts` and the `await this.ensureSchema()` call in `onModuleInit`. The service just calls `$connect()`. Remove now-unused imports: `execSync`, `join` (if no other uses), `existsSync`, `mkdirSync` — but only the ones the removal makes orphaned.

### 5. Test changes

Remove `apps/api/src/prisma/prisma.service.spec.ts` tests that cover `ensureSchema` behavior (the "push schema when no tables" and "skip when tables exist" tests). Keep the connection/initialization tests if any exist outside `ensureSchema`.

### 6. Dev workflow

`prisma:push` script in `apps/api/package.json` is replaced by `prisma:migrate` (already exists as `prisma migrate dev`). Update `AGENTS.md` to document the new workflow: use `pnpm --filter @taskforge/api prisma:migrate -- --name <description>` to create migration files in dev. `db:push` is removed.

### 7. Root package.json

Remove `db:push` script, update `db:migrate` if needed (it already points to `prisma:migrate`).

## Data flow

- **Fresh user (no volume):** entrypoint runs `migrate deploy` → applies `init` migration → creates all tables → app starts. Same UX as today.
- **Returning user (has volume):** entrypoint runs `migrate deploy` → applies any new migrations added since their last version → app starts. Existing data preserved.
- **Dev (local):** developer runs `prisma migrate dev --name <desc>` after changing `schema.prisma` → creates a new migration file → commits it → next image build ships it → users' containers apply it on boot.

## Error handling

- If `migrate deploy` fails, the entrypoint exits non-zero. The container crashes and restarts (Docker restart policy or orchestrator handles this). SQLite migrations run in a transaction, so a failed migration leaves the DB in its pre-migration state.
- If the app starts but the DB has no tables (impossible if entrypoint ran, but defensively), Prisma queries will fail with clear errors.

## Out of scope

- Legacy baselining for `db push`-created databases (no existing users).
- Migration rollback (Prisma is forward-only).
- Multi-database support (SQLite only).
- Dev sandbox auto-reset.

## Verification

- Build the image locally, run with a fresh volume → tables exist, app responds.
- Run with a volume from a previous version, add a new migration, rebuild → migration applies, data preserved.
- `docker-entrypoint.sh` is executable and `exec`s into node (signals propagate).
- `prisma.service.spec.ts` passes with `ensureSchema` tests removed.