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
cd apps/api && pnpm prisma:generate && pnpm prisma:push
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
| Prisma push schema | `pnpm db:push`                                                          |
| Prisma migrate     | `pnpm db:migrate`                                                       |
| Docker build       | `pnpm docker:build`                                                     |

## Gotchas

- **API `strict: false`** — the NestJS app deliberately does not use TypeScript strict mode (decorator metadata requires it). Do not add `strict: true` to `apps/api/tsconfig.json`.
- **API is CommonJS, Web is ESM** — module resolution differs. Don't copy import patterns between apps.
- **PrismaModule is `@Global()`** — no need to import it into feature modules.
- **No authentication** — the app is designed for local/trusted-network use only.
- **No ESLint config file** — lint scripts rely on NestJS CLI defaults for the API. No custom rules exist.
- **No CI, no pre-commit hooks** — nothing runs automatically on push.
- **`packages/` directory doesn't exist yet** — the workspace config includes it, but nothing is there.
- **SQLite DB is gitignored** — `*.db` and `*.db-journal` are in `.gitignore`.
- **API serves the SPA in production** — `main.ts` uses `useStaticAssets` pointing to `../../web/dist` with SPA fallback.
- Always use kebap-case filenames
- Always write unit tests
- Always write helpful little docs for the future guy

## Architecture

**API** (`apps/api/src/`): Each domain (`boards`, `lists`, `tasks`, `comments`, `labels`, `activity`, `mcp`, `events`, `prisma`) is a NestJS module with `controller.ts`, `service.ts`, `module.ts`, `service.spec.ts`, and `dto/` subfolder.

**MCP service** routes via `resource_action` pattern parsed from the JSON-RPC method field (e.g., `boards_list`, `tasks_create`).

**Events**: `EventsService` (EventEmitter2) broadcasts changes via WebSocket gateway. Both REST controllers and MCP service call `events.emit()`.

**Web** (`apps/web/src/`): Path alias `@/` → `src/`. Components in `components/`, UI primitives in `components/ui/` (shadcn, `radix-nova` style). Two routes: `/` (HomePage) and `/board/:id` (KanbanBoard).

## Testing

- **API tests** create a real SQLite DB in a temp directory per run (`createTestPrisma()`), push schema via `execSync`. Tests are integration-level, not mocked unit tests.
- Each test file cleans all tables in `afterEach` (deleteMany in reverse dependency order).
- Seed helpers: `seedBoard()`, `seedLabel()`, `seedTask()`, `seedComment()`.
- **Web tests** mock `global.fetch` — they test the API client module, not real HTTP.
- No component tests (`.test.tsx`) exist yet.
