# Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the TaskForge single-container image to Docker Hub on every push to `main`, with auto-bumped semver tags and amd64+arm64 multi-arch builds, guarded by PR checks.

**Architecture:** Two GitHub Actions workflows. `ci.yml` runs lint/tests/docker-build on PRs and main pushes. `release.yml` runs only on main push: a `bump-version` job computes the next semver tag and pushes it, then a `docker` job builds multi-arch images via buildx and pushes five tags to Docker Hub using repo secrets.

**Tech Stack:** GitHub Actions, Docker Buildx, QEMU, pnpm 10.12.1, Node 23, Prisma 6, Turbo, Jest, Vitest.

## Global Constraints

- pnpm version pinned to `10.12.1` (matches `package.json` `packageManager`).
- Node version `23` (matches `Dockerfile` `FROM node:23-alpine`).
- Docker Hub namespace: `emreycolakoglu/taskforge`.
- Required GitHub secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
- First release tag: `v1.0.0` (no existing tags — verified).
- Image tags pushed per release `vX.Y.Z` on commit `<sha>`: `:latest`, `:X.Y.Z`, `:X.Y`, `:X`, `:sha-<short>`.
- Platforms: `linux/amd64,linux/arm64`.
- No third-party version-bump actions — use a shell step.
- No changes to `Dockerfile` or `docker-compose.yml` (verified compatible with multi-arch; compose PORT override is intentional).
- Filenames kebab-case per AGENTS.md.

---

### Task 1: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `package.json` (`packageManager: pnpm@10.12.1`), `turbo.json` (`lint`, `build` tasks), `apps/api/package.json` (`test`, `prisma:generate`), `apps/web/package.json` (`test`).
- Produces: A workflow named `ci` that runs on `pull_request` and `push` to `main`. Later tasks do not depend on outputs from this workflow, but `release.yml` (Task 2) triggers on the same `push` event and runs in parallel — CI passing is not a hard gate for release in GitHub Actions unless wired with `workflow_run`. Per the spec, both run on push to main; release.yml is independent.

- [ ] **Step 1: Create the CI workflow file**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.12.1

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 23
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm --filter @taskforge/api exec prisma generate

      - name: Lint
        run: pnpm lint

      - name: Test API
        run: pnpm --filter @taskforge/api test

      - name: Test Web
        run: pnpm --filter @taskforge/web test

      - name: Verify Docker build
        run: docker build -t taskforge:ci .
```

- [ ] **Step 2: Validate YAML locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output, exit 0. (If yaml module missing, run `python3 -c "import sys; sys.exit(0)"` — the file is simple enough; alternatively use `act --list` if `act` is installed.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint/test/docker-build workflow for PRs and main"
```

---

### Task 2: Release workflow — bump-version job

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: git tag history (must fetch tags with `fetch-depth: 0`).
- Produces: `$GITHUB_ENV` with `NEXT_VERSION` (e.g. `1.0.0`, no `v` prefix) and `SHORT_SHA` (first 7 chars of HEAD) for the downstream `docker` job in Task 3. Also pushes a `vX.Y.Z` tag to the repo.

- [ ] **Step 1: Create the release workflow with the bump-version job**

Create `.github/workflows/release.yml` with this exact content:

```yaml
name: release

on:
  push:
    branches: [main]

jobs:
  bump-version:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      next_version: ${{ steps.bump.outputs.next_version }}
      short_sha: ${{ steps.bump.outputs.short_sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

      - name: Compute next version
        id: bump
        run: |
          set -euo pipefail
          SHORT_SHA=$(git rev-parse --short=7 HEAD)
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          if [ -z "$LAST_TAG" ]; then
            NEXT_VERSION="1.0.0"
          else
            # Strip leading v, split on dots
            BASE="${LAST_TAG#v}"
            MAJOR=$(echo "$BASE" | cut -d. -f1)
            MINOR=$(echo "$BASE" | cut -d. -f2)
            PATCH=$(echo "$BASE" | cut -d. -f3)
            PATCH=$((PATCH + 1))
            if [ "$PATCH" -gt 99 ]; then
              PATCH=0
              MINOR=$((MINOR + 1))
            fi
            if [ "$MINOR" -gt 99 ]; then
              MINOR=0
              MAJOR=$((MAJOR + 1))
            fi
            NEXT_VERSION="${MAJOR}.${MINOR}.${PATCH}"
          fi
          echo "next_version=$NEXT_VERSION" >> "$GITHUB_OUTPUT"
          echo "short_sha=$SHORT_SHA" >> "$GITHUB_OUTPUT"
          echo "Next version: v$NEXT_VERSION (sha $SHORT_SHA)"

      - name: Push tag
        run: |
          git tag "v${{ steps.bump.outputs.next_version }}"
          git push origin "v${{ steps.bump.outputs.next_version }}"
```

- [ ] **Step 2: Validate YAML locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow with semver bump job"
```

---

### Task 3: Release workflow — docker build & push job

**Files:**
- Modify: `.github/workflows/release.yml` (append a second job)

**Interfaces:**
- Consumes: `bump-version.outputs.next_version` (e.g. `1.0.0`) and `bump-version.outputs.short_sha` (first 7 chars of HEAD) from Task 2. Secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` from repo settings (Task 4).
- Produces: Five Docker Hub image tags under `emreycolakoglu/taskforge`: `:latest`, `:X.Y.Z`, `:X.Y`, `:X`, `:sha-<short>`.

- [ ] **Step 1: Append the docker job to release.yml**

Edit `.github/workflows/release.yml` and append this job at the same indentation level as `bump-version:` (i.e. two spaces under `jobs:`), separated by a blank line:

```yaml
  docker:
    needs: bump-version
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Derive tag variants
        id: tags
        env:
          NEXT_VERSION: ${{ needs.bump-version.outputs.next_version }}
        run: |
          set -euo pipefail
          MAJOR=$(echo "$NEXT_VERSION" | cut -d. -f1)
          MINOR=$(echo "$NEXT_VERSION" | cut -d. -f1,2)
          echo "major=$MAJOR" >> "$GITHUB_OUTPUT"
          echo "minor=$MINOR" >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            emreycolakoglu/taskforge:latest
            emreycolakoglu/taskforge:${{ needs.bump-version.outputs.next_version }}
            emreycolakoglu/taskforge:${{ steps.tags.outputs.minor }}
            emreycolakoglu/taskforge:${{ steps.tags.outputs.major }}
            emreycolakoglu/taskforge:sha-${{ needs.bump-version.outputs.short_sha }}
```

The `Derive tag variants` step splits `1.2.3` into `1` (major) and `1.2` (minor) so the five tag lines cover `latest`, full semver, minor, major, and sha.

- [ ] **Step 2: Validate final YAML**

Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/release.yml')); assert set(d['jobs'])=={'bump-version','docker'}, list(d['jobs']); assert len(d['jobs']['docker']['steps'])==6"`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add multi-arch docker build and push to release workflow"
```

---

### Task 4: Docker Hub and GitHub secrets setup (manual, no code)

**Files:**
- None (account configuration on hub.docker.com and github.com).

**Interfaces:**
- Consumes: the workflow from Tasks 2–3 which reads `secrets.DOCKERHUB_USERNAME` and `secrets.DOCKERHUB_TOKEN`.
- Produces: working credentials for the `docker` job's login step.

- [ ] **Step 1: Create the Docker Hub repository**

1. Log in to https://hub.docker.com.
2. Click **Repositories** → **Create**.
3. Namespace: `emreycolakoglu` (your account namespace).
4. Repository name: `taskforge`.
5. Visibility: **Public**.
6. Click **Create**.

The repository can be empty — the first push will populate it.

- [ ] **Step 2: Create a Docker Hub access token**

1. Go to https://hub.docker.com/settings/security.
2. Click **New Access Token**.
3. Description: `github-actions-taskforge-release`.
4. Permissions: **Read, Write, Delete** (Write is required for push; Delete keeps the token usable if you ever prune old tags).
5. Click **Generate**.
6. Copy the token immediately — it is shown once. Store it somewhere safe until you finish Step 3.

- [ ] **Step 3: Add GitHub Actions secrets**

1. Go to https://github.com/emreycolakoglu/taskforge/settings/secrets/actions.
2. Click **New repository secret**.
   - Name: `DOCKERHUB_USERNAME`
   - Secret: `emreycolakoglu` (your Docker Hub username, lowercase)
3. Click **Add secret**.
4. Click **New repository secret** again.
   - Name: `DOCKERHUB_TOKEN`
   - Secret: (paste the token from Step 2)
5. Click **Add secret**.

- [ ] **Step 4: Verify secrets are visible**

On the same settings page, confirm both `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` appear in the list. No commit — this task touches no files.

---

### Task 5: First release — push workflows to main and verify

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: `.github/workflows/ci.yml` (Task 1), `.github/workflows/release.yml` (Tasks 2–3), secrets from Task 4.
- Produces: a `vX.Y.Z` git tag, five Docker Hub image tags, and a green workflow run in the Actions tab.

- [ ] **Step 1: Push the commits to main**

```bash
git push origin main
```

Expected: the three commits from Tasks 1–3 land on `origin/main`. This push itself triggers both workflows.

- [ ] **Step 2: Watch the CI workflow**

1. Go to https://github.com/emreycolakoglu/taskforge/actions.
2. Click the latest **ci** run.
3. The `verify` job should go green within ~5–10 minutes. Steps: install, prisma generate, lint, test API, test web, docker build.
4. If any step fails, read the log, fix the underlying issue locally, commit, and push again. The release workflow will re-run on the new push.

- [ ] **Step 3: Watch the release workflow**

1. On the same Actions page, click the latest **release** run.
2. The `bump-version` job should go green first. Check its log: it should print `Next version: v1.0.0 (sha <7-char-sha>)` and then push the tag.
3. The `docker` job should start once `bump-version` is green. Multi-arch build via QEMU takes ~10–20 minutes on the first run.
4. When `docker` is green, the workflow is complete.

- [ ] **Step 4: Verify the tag was created**

```bash
git fetch --tags
git tag --list 'v*'
```

Expected: `v1.0.0` appears, pointing at the release commit.

- [ ] **Step 5: Verify images on Docker Hub**

1. Go to https://hub.docker.com/r/emreycolakoglu/taskforge/tags.
2. Confirm five tags: `latest`, `1.0.0`, `1.0`, `1`, `sha-<short-sha>`.
3. Each tag should show two OS/ARCH entries: `linux/amd64` and `linux/arm64`.

- [ ] **Step 6: Pull and run the image locally**

```bash
docker pull emreycolakoglu/taskforge:latest
docker run --rm -p 3000:3000 emreycolakoglu/taskforge:latest
```

In another terminal:
```bash
curl http://localhost:3000/api/boards
```

Expected: a JSON response (empty array `[]` for a fresh DB, or whatever the API returns on the boards list endpoint). The container should stop cleanly on Ctrl-C.

- [ ] **Step 7: Verify a second push bumps the version**

Make a trivial change (e.g. add a line to `README.md`), commit, and push:
```bash
git commit --allow-empty -m "test: trigger a second release"
git push origin main
```

Then check the Actions tab again. The new `release` run should print `Next version: v1.0.1` and push `v1.0.1`. Docker Hub should now show `latest`, `1.0.1`, `1.0`, `1`, and `sha-<new-short-sha>` — note `1.0` and `1` now point at the `1.0.1` manifest, and `1.0.0` remains as a historical pin.

Clean up the test commit if you want:
```bash
git reset --hard HEAD~1 && git push --force-with-lease origin main
```
(Note: this does not delete the `v1.0.1` tag or the Docker Hub tags — they are permanent. If you want to remove the tag: `git push origin :refs/tags/v1.0.1` and delete the tags from Docker Hub UI.)

---

## Self-Review Notes

- **Spec coverage:** ci.yml (✓ Task 1), release.yml bump-version (✓ Task 2), release.yml docker with multi-arch + 5 tags (✓ Task 3), Docker Hub + GH secrets (✓ Task 4), verification (✓ Task 5). Out-of-scope items (GHCR, changelog, build cache, pre-release channels) intentionally not implemented.
- **Placeholders:** None — every code step contains the exact YAML or shell to run.
- **Type consistency:** `next_version` and `short_sha` are the only cross-job outputs; used consistently in Tasks 2 and 3. Tag variants derived in Task 3 via `cut -d. -f1` and `cut -d. -f1,2` — matches the `MAJOR.MINOR.PATCH` format produced by Task 2's bump logic.