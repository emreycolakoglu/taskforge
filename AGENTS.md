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

## Workflow

**Never merge to `main` directly after creating a feature.** Always open a pull request using the `gh` CLI tool so CI can run and the change can be reviewed before it lands on `main`. Example:

```bash
gh pr create --title "feat: <short description>" --body "<what and why>"
```

Do not push to or merge into `main` directly. Let CI (`ci.yml`) pass on the PR before merging.

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
| Regenerate PWA icons | `pnpm --filter @taskforge/web icons`                                  |

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
- **Authentication is global and on by default** — `AuthModule` binds `AuthGuard` as an `APP_GUARD`, so *every* route requires an `Authorization: Bearer <token>` matching a live `Session` row unless it carries `@Public()`. Tokens are opaque `crypto.randomUUID()` session tokens (not JWTs); passwords are bcrypt cost 12. `@Admin()` gates admin-only routes on `user.role`. The public surface is small and deliberate: `auth/status`, `auth/onboard`, `auth/login`, `auth/signup/:token`, two settings routes, and `public/tasks/:identifier/:number`.
- **There is no per-board authorization** — the `Member` model exists with `admin`/`member`/`viewer` roles but **nothing reads it**. Any authenticated user can read and write any board, task, comment, or label. Auth here is authentication-only. Don't assume board scoping exists; if you need it, it has to be built.
- **No ESLint config file** — lint scripts reference `eslint` but it's not installed in either app. `pnpm lint` will fail. CI does not run lint.
- **The web build does NOT typecheck** — `@taskforge/web`'s `build` script is bare `vite build`, which only transpiles. A passing build proves nothing about types. Run `cd apps/web && npx tsc --noEmit` explicitly. Note it currently reports **3 pre-existing errors** (in `kanban-board.tsx`, `ui/dropdown-menu.tsx`, `use-labels.ts`) — check the count hasn't grown rather than expecting zero.
- **Board identifiers must be exactly 3 uppercase letters** — enforced by a `Matches` rule in `CreateBoardDto`. `TF` is rejected; `TFG` is fine.
- **CI gates releases** — `release.yml` triggers via `workflow_run` on `ci` success. A broken main push won't publish to Docker Hub.
- **`packages/` directory doesn't exist yet** — the workspace config includes it, but nothing is there.
- **SQLite DB is gitignored** — `*.db` and `*.db-journal` are in `.gitignore`.
- **SQLite persistence requires a named volume** — the DB lives at `/data/taskforge.db` inside the container. Without a named volume mounted at `/data` (or a bind mount), redeploying wipes the DB. The Dockerfile declares `VOLUME ["/data"]` for anonymous-volume safety, but real persistence needs an explicit named volume. See `docker-compose.yml` for the pattern.
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

**API** (`apps/api/src/`): Each domain (`auth`, `boards`, `statuses`, `tasks`, `comments`, `labels`, `relations`, `activity`, `subscriptions`, `notifications`, `settings`, `public`, `mcp`, `events`, `prisma`) is a NestJS module with `controller.ts`, `service.ts`, `module.ts`, `service.spec.ts`, and `dto/` subfolder.

**MCP service** routes via `resource_action` pattern parsed from the JSON-RPC method field (e.g., `boards_list`, `tasks_create`).

**Events**: `EventsService` (an RxJS `Subject`, not EventEmitter2) broadcasts changes via the WebSocket gateway. Both REST controllers and MCP service call `events.emit()`. Scoping is opt-in by the emitter: `emit(event, data, boardId?)` without a `boardId` broadcasts to **every** connected socket.

**Web** (`apps/web/src/`): Path alias `@/` → `src/`. Components in `components/`, UI primitives in `components/ui/` (shadcn, `radix-nova` style). Routes are declared inline in `app.tsx`: `/`, `/board/:id`, `/board/:id/settings`, `/board/:boardId/task/:taskId`, `/tasks`, `/settings`, `/account`, `/inbox`, plus the unauthenticated `/login`, `/signup/:token`, `/onboarding` and `/public/:identifier/:number`.

## Public task sharing

A task can be published to a read-only page reachable without a session. The model is **publication, not a secret link**: the URL is the task's real identity (`/public/TFG/123`), so it is enumerable on purpose, and un-publishing means the page 404s from that moment on — it does not rotate the address.

- **Toggle**: `PUT`/`DELETE /api/tasks/:id/publish` → `TasksService.setPublic`. Deliberately *not* a field on `UpdateTaskDto`, because `update()`'s activity diff uses truthy checks (`if (dto.title && …)`) and would silently fail to log `isPublic: false` — and because a DTO field would let MCP's generic `tasks_update` publish a task as a side effect. Writes `published`/`unpublished` Activity rows. Rejects bot sessions (`session.bot`).
- **Read**: `GET /api/public/tasks/:identifier/:number` → `PublicService`, marked `@Public()`. Hand-built `select` — **never** `include` — so `assignee.email`, `role` and the nested board can't ride along. Returns 404 for both "no such task" and "not published", so the two are indistinguishable.
- **Payload is curated**: taskNumber, title, description, status, priority, labels, comments, assignee display name. Activity, sub-tasks, parent and relations are omitted **by design** — publishing one task must not disclose the titles of tasks nobody published.
- **Frontend**: `pages/public-task-page.tsx`, mounted in `app.tsx` *above* `AuthProvider` (not exempted from inside it) so no redirect, `/auth/status` call, or `SidebarLayout` can touch it. It fetches through `hooks/public-api.ts`, never `hooks/api.ts` — the shared client clears the token and redirects to `/login` on any 401, which would log a signed-in colleague out just for opening a public link.
- **Not indexed**: `index.html` carries `<meta name="robots" content="noindex, nofollow">` and `public/robots.txt` disallows everything. Enumeration takes intent; a search hit takes none.

## Installable PWA

The web app is installable — "Install app" on desktop/Android, "Add to Home Screen" on iOS. Wired with `vite-plugin-pwa` (`generateSW` mode) in `apps/web/vite.config.ts`; the manifest itself lives in `apps/web/src/pwa/manifest.ts`.

- **Manifest lives in `src/`, not next to the vite config**, so `tsc` and vitest can both see it. `src/pwa/manifest.test.ts` asserts Chrome's installability rules and that every icon `src` resolves to a real file — renaming the art without re-running the icon script breaks installation *silently* (the app still builds and loads, it just stops offering "Install").
- **Icons are generated, not hand-drawn.** Source art is `apps/web/assets/pwa/*.svg`; `pnpm --filter @taskforge/web icons` rasterizes it to `apps/web/public/icons/*.png` via puppeteer (already a devDep). The PNGs are committed — re-run only when the SVG changes, and never hand-edit the PNGs. PNG rather than SVG because iOS home-screen icons and Android launcher tiles require raster.
- **`app-icon.svg` vs `app-icon-maskable.svg`** — the maskable one is full-bleed with no corner radius, because the launcher crops it to its own shape and supplies the rounding; its glyph stays inside the 80%-diameter safe zone. `apple-touch-icon.png` renders from the *maskable* art too: iOS composites transparency against black, so the rounded-corner art would get black slivers around the squircle.
- **The service worker precaches the app shell only. Do not add `runtimeCaching` for `/api`.** Every route is behind a session token and boards are shared between users, so caching responses would park another user's task data in Cache Storage, where logout does not reach it.
- **`navigateFallbackDenylist` covers `/api` and `/ws`** — without it the SW answers XHRs and the socket handshake with the HTML shell, which surfaces as JSON parse errors rather than anything that names the service worker.
- **`registerType: 'autoUpdate'`** — the app lives in a pinned tab, so waiting for every tab to close would mean stale assets for days.
- **The PWA only exists in production builds.** `vite dev` does not emit a manifest or SW, so install won't be offered on :5173. To test: `pnpm --filter @taskforge/web build && pnpm --filter @taskforge/web preview`. In production, NestJS's `useStaticAssets` serves `/manifest.webmanifest`, `/sw.js` and `/icons/*` before the SPA fallback, and static files bypass the global `AuthGuard`.
- **Install needs a secure context** — HTTPS, or localhost. Deploying the container behind plain HTTP means no install prompt, regardless of the manifest.
- `noindex` and `robots.txt Disallow: /` do **not** affect installability.

## Testing

- **API tests** create a real SQLite DB in a temp directory per run (`createTestPrisma()` in `apps/api/test/setup.ts`), apply schema via `prisma db push`. Tests are integration-level, not mocked unit tests. The test helper still uses `db push` (not `migrate deploy`) because it creates a fresh throwaway DB each time — `db push` is faster for that use case.
- Each test file cleans all tables in `afterEach` (deleteMany in reverse dependency order).
- Seed helpers: `seedBoard()`, `seedLabel()`, `seedTask()`, `seedComment()`, `seedRelation()`, `seedUser()`, `seedSubscription()`, `seedNotification()`.
- **Web tests** (Vitest) mock `global.fetch` for API-client tests, and mock the `use-*` hook modules for component tests. Component tests (`.test.tsx`) exist — e.g. `pages/task-detail-page.test.tsx`, `components/detail-breadcrumb-bar.test.tsx`. When you add a hook to a module a component test mocks, add it to that `vi.mock` factory too or the suite fails with "No _ export is defined on the mock".
