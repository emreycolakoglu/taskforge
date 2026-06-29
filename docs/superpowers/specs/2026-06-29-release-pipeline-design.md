# Release Pipeline Design

Date: 2026-06-29
Status: Approved (brainstorm)

## Goal

Publish the TaskForge single-container image (NestJS API + React SPA + SQLite) to Docker Hub on every push to `main`, with auto-bumped semver tags and multi-arch support. Guard `:latest` with PR checks so broken merges can't ship.

## Triggers

- **Pull request to main** → run `ci.yml` (lint, tests, docker build, no push).
- **Push to main** → run `ci.yml` then `release.yml` (bump semver tag, build, push to Docker Hub).

## Versioning

No tags exist today. The bump job handles the no-tags case explicitly: if `git describe` finds nothing, it starts at `v1.0.0` rather than bumping from `v0.0.0`.

On every push to main, `release.yml`:

1. Fetches the latest semver tag via `git describe --tags --abbrev=0`. If none exists, the next version is `v1.0.0`.
2. Otherwise bumps the patch component (`v1.0.0` → `v1.0.1`, `v1.2.9` → `v1.2.10`, rolls minor/major on overflow).
3. Pushes the new tag back to the repo on the triggering commit.

Implemented with a small shell step. No third-party version-bump action, to keep the supply-chain surface minimal.

## Docker tags

For a release `v1.2.3` on commit `abc1234`:

- `emreycolakoglu/taskforge:latest`
- `emreycolakoglu/taskforge:1.2.3`
- `emreycolakoglu/taskforge:1.2`
- `emreycolakoglu/taskforge:1`
- `emreycolakoglu/taskforge:sha-abc1234` (traceability; not auto-rolled)

## Architecture

```
PR → main ──► ci.yml (lint, test, build image, no push)
main push ──► ci.yml
            └─► release.yml
                  ├─► bump-version  (git tag vX.Y.Z, push)
                  └─► docker         (buildx multi-arch, push)
```

### `ci.yml`

Triggers: `pull_request` to main, `push` to main.

Steps (single job, `ubuntu-latest`):

1. Checkout.
2. Setup pnpm 10.12.1 (matches `package.json` `packageManager`).
3. Setup Node 23 (matches Dockerfile).
4. `pnpm install --frozen-lockfile`.
5. `pnpm --filter @taskforge/api exec prisma generate` (API crashes without Prisma client).
6. `pnpm lint`.
7. `pnpm --filter @taskforge/api test`.
8. `pnpm --filter @taskforge/web test`.
9. `docker build -t taskforge:ci .` (verify image compiles; no push).

### `release.yml`

Triggers: `push` to `main` only.

Two jobs:

**`bump-version`** (`ubuntu-latest`, default `GITHUB_TOKEN`):
1. Checkout with `fetch-tags: true` and `fetch-depth: 0`.
2. Compute next version: if `git describe --tags --abbrev=0` fails (no tags), use `1.0.0`; else fetch the last tag, bump patch (with minor/major rollover on overflow), strip leading `v`.
3. `git tag v$NEXT && git push origin v$NEXT`.
4. Expose `NEXT_VERSION` and `SHORT_SHA` via `$GITHUB_ENV`.

**`docker`** (`ubuntu-latest`, `needs: bump-version`):
1. Checkout.
2. Set up QEMU (`docker/setup-qemu-action`).
3. Set up Docker Buildx (`docker/setup-buildx-action`).
4. Login to Docker Hub using `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets (`docker/login-action`).
5. `docker/build-push-action` with:
   - `context: .`
   - `platforms: linux/amd64,linux/arm64`
   - `push: true`
   - `tags`: the five tags listed above (constructed from `NEXT_VERSION` and `SHORT_SHA` passed via `$GITHUB_ENV` from the bump job).

## Repo prep

### Docker Hub

1. Create a **public** repository `emreycolakoglu/taskforge` on Docker Hub (empty is fine; first push will populate it).
2. Create an **access token** at https://hub.docker.com/settings/security — scope: Read/Write/Delete on the repository (or Public Repo Read-only if you prefer narrower; write is required for push).

### GitHub

Add two repository secrets under Settings → Secrets and variables → Actions:

- `DOCKERHUB_USERNAME` — your Docker Hub username (e.g. `emreycolakoglu`).
- `DOCKERHUB_TOKEN` — the access token from above (not your password).

## Dockerfile / compose fixes

Current `docker-compose.yml` uses `PORT=4321` while the Dockerfile `EXPOSE`s 3000 and defaults `PORT=3000`. The compose file is for local dev override only and is correct as-is (it intentionally overrides the default). No change needed.

No Dockerfile changes are required for multi-arch: `node:23-alpine` supports both `linux/amd64` and `linux/arm64`. The `wget` used in `HEALTHCHECK` is provided by BusyBox on alpine for both arches.

## Out of scope

- GHCR mirror (Docker Hub only per decision).
- GitHub Releases / auto-changelog.
- External build cache (registry cache, BuildKit cache).
- Pre-release / beta channels.
- Minor/major bumps remain manual (cut a tag by hand when needed; the next push after a manual `v2.0.0` tag will continue auto-bumping patch from there).

## Verification

- Open a PR → `ci.yml` runs, must pass before merge.
- Merge to main → `ci.yml` reruns, then `release.yml` runs.
- Check repo Actions tab: `release.yml` should show two green jobs (bump-version, docker).
- Check Docker Hub repo: five tags appear, `latest` matches the just-pushed commit.
- `docker pull emreycolakoglu/taskforge:latest && docker run -p 3000:3000 emreycolakoglu/taskforge:latest` → API responds on `http://localhost:3000/api/boards`.
- `git tag --list 'v*'` shows the new semver tag on the release commit.

## Failure modes

- **Bump-version fails to push tag** (race with concurrent main push): the docker job is skipped, no image pushed. Next push retries cleanly. Tag history stays monotonic.
- **Docker Hub credentials wrong/rotated**: docker job fails at login step. Fix the secret and rerun the workflow from Actions UI.
- **Multi-arch build slow**: QEMU emulation for arm64 roughly doubles build time (~5-10 min depending on network). Acceptable now; revisit with BuildKit cache if it grows.