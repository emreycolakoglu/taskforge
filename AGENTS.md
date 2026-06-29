# TaskForge — Agent Guide

## Project

Full-stack Kanban task board for humans and AI agents. Three interfaces from one NestJS server: REST API (`/api/*`), MCP JSON-RPC endpoint (`/api/mcp`), and a React SPA. SQLite via Prisma. WebSocket events on `/ws`.

## Monorepo

Turborepo + pnpm workspaces. Two apps, no shared packages yet:

| Package          | Path        | Stack                                                             |
| ---------------- | ----------- | ----------------------------------------------------------------- |
| `@taskforge/api` | `apps/api/` | NestJS 11, Prisma 6, SQLite, Socket.IO, CommonJS, `strict: false` |
| `@taskforge/web` | `apps/web/` | React 19, Vite 6, Tailwind 4, shadcn/ui, ESM, `strict: true`      |

Run commands for a single package from root: `pnpm --filter @taskforge/api <cmd>`

## Setup (order matters)

```bash
pnpm install
cd apps/api && pnpm prisma:generate && pnpm prisma:migrate
pnpm dev          # API on :3000, Web on :5173 (proxies /api and /ws to :3000)
```

The API will crash if Prisma client hasn't been generated. The web app needs the API running for data.

## Commands

| What               | Command                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Dev (both apps)    | `pnpm dev`                                                              |
| Build all          | `pnpm build`                                                            |
| Lint all           | `pnpm lint`                                                             |
| API tests (Jest)   | `pnpm --filter @taskforge/api test`                                     |
| Single API test    | `pnpm --filter @taskforge/api test -- --testPathPattern=boards.service` |
| Web tests (Vitest) | `pnpm --filter @taskforge/web test`                                     |
| Single web test    | `cd apps/web && npx vitest run src/hooks/api.test.ts`                   |
| Prisma generate    | `pnpm db:generate`                                                      |
| Prisma migrate     | `pnpm db:migrate` (use `-- --name <desc>` to create new migrations)     |
| Docker build       | `pnpm docker:build`                                                      |

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- **`ci.yml`** — runs on PRs and pushes to `main`: installs deps, generates Prisma client, runs API + web tests, verifies Docker build compiles (no push).
- **`release.yml`** — triggered by `ci` succeeding on `main` via `workflow_run`: bumps a semver tag (`vX.Y.Z`), builds multi-arch (amd64 + arm64) images, pushes to Docker Hub under `emreyc/taskforge` with tags `:latest`, `:X.Y.Z`, `:X.Y`, `:X`, `:sha-<short>`.

Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

Schema migrations run automatically on container startup via `apps/api/docker-entrypoint.sh` (runs `prisma migrate deploy` then `exec`s into node). To ship a schema change: run `pnpm --filter @taskforge/api prisma:migrate -- --name <desc>` locally, commit the new migration file, push to main.

## Gotchas

- **API `strict: false`** — the NestJS app deliberately does not use TypeScript strict mode (decorator metadata requires it). Do not add `strict: true` to `apps/api/tsconfig.json`.
- **API is CommonJS, Web is ESM** — module resolution differs. Don't copy import patterns between apps.
- **PrismaModule is `@Global()`** — no need to import it into feature modules.
- **No authentication** — the app is designed for local/trusted-network use only.
- **No ESLint config file** — lint scripts reference `eslint` but it's not installed in either app. `pnpm lint` will fail. CI does not run lint.
- **CI gates releases** — `release.yml` triggers via `workflow_run` on `ci` success. A broken main push won't publish to Docker Hub.
- **`packages/` directory doesn't exist yet** — the workspace config includes it, but nothing is there.
- **SQLite DB is gitignored** — `*.db` and `*.db-journal` are in `.gitignore`.
- **API serves the SPA in production** — `main.ts` uses `useStaticAssets` pointing to `../../web/dist` with SPA fallback.
- **Migrations run on container startup** — `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the app. The old `ensureSchema` method in `PrismaService` was removed; schema management is now the entrypoint's job, not the app's.
- **Frontend must follow `design.md`** — read it before any `apps/web/` change; use the defined tokens, not hardcoded colors or ad-hoc styling.
- Always use kebap-case filenames
- Always write unit tests
- Always write helpful little docs for the future guy

## Design System

**Required reading for all frontend work.** Before writing or modifying any code in `apps/web/`, read [`design.md`](./design.md) and conform to its tokens, component guidance, and do's/don'ts. The design system is the source of truth for colors, typography, spacing, radius, shadows, and component styling — do not improvise alternatives.

The web UI follows the Linear "midnight command deck" design system — dark-only, near-black canvas, one rationed Acid Lime accent, Inter Variable + JetBrains Mono typography, inset-border elevation. Token mappings live in `apps/web/src/index.css` (`:root` + `@theme inline`). Key rules that are easy to violate:

- Acid Lime (`--primary`) is for exactly one primary CTA per screen — never decorative, never for borders/hover/highlights.
- No gradients on UI surfaces. No bright fills on cards — use Obsidian/Charcoal with border-defined edges.
- Inter Variable weights cap at 590 — never 700+. Use JetBrains Mono (`font-mono`) for IDs, code, timestamps, keyboard hints.
- Cards get depth from 1px inset Graphite border + soft drop shadow, not fills.
- No new accent colors — palette is Lime + Indigo + semantic (Emerald/Crimson/Cyan) only.

## Architecture

**API** (`apps/api/src/`): Each domain (`boards`, `lists`, `tasks`, `comments`, `labels`, `activity`, `mcp`, `events`, `prisma`) is a NestJS module with `controller.ts`, `service.ts`, `module.ts`, `service.spec.ts`, and `dto/` subfolder.

**MCP service** routes via `resource_action` pattern parsed from the JSON-RPC method field (e.g., `boards_list`, `tasks_create`).

**Events**: `EventsService` (EventEmitter2) broadcasts changes via WebSocket gateway. Both REST controllers and MCP service call `events.emit()`.

**Web** (`apps/web/src/`): Path alias `@/` → `src/`. Components in `components/`, UI primitives in `components/ui/` (shadcn, `radix-nova` style). Two routes: `/` (HomePage) and `/board/:id` (KanbanBoard).

## Testing

- **API tests** create a real SQLite DB in a temp directory per run (`createTestPrisma()` in `apps/api/test/setup.ts`), apply schema via `prisma db push`. Tests are integration-level, not mocked unit tests. The test helper still uses `db push` (not `migrate deploy`) because it creates a fresh throwaway DB each time — `db push` is faster for that use case.
- Each test file cleans all tables in `afterEach` (deleteMany in reverse dependency order).
- Seed helpers: `seedBoard()`, `seedLabel()`, `seedTask()`, `seedComment()`.
- **Web tests** mock `global.fetch` — they test the API client module, not real HTTP.
- No component tests (`.test.tsx`) exist yet.
