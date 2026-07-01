# TaskForge — Docker
# Single container: NestJS API (REST + MCP + WebSocket) + React SPA + SQLite

# ─── Stage 1: Install pnpm ───
FROM node:23-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# ─── Stage 2: Dependencies ───
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile || pnpm install

# ─── Stage 3: Build ───
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @taskforge/api exec prisma generate
RUN pnpm build

# ─── Stage 4: Production ───
FROM node:23-alpine AS runner
WORKDIR /app

# Install pnpm in runner
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/data/taskforge.db"
ENV CORS_ORIGIN="*"

# Copy built API
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# Copy built web (SPA)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Copy node_modules for API (prisma client etc)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

# Create data directory for SQLite and declare it as a volume so the
# SQLite database survives container recreation when no -v flag is given.
# For named-volume persistence across redeploys, mount a volume at /data
# (see docker-compose.yml).
RUN mkdir -p /data
VOLUME ["/data"]

# Prisma generate in production
RUN cd apps/api && pnpm prisma:generate

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/settings/initialized').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Serve API
WORKDIR /app/apps/api
CMD ["./docker-entrypoint.sh"]

EXPOSE 3000
