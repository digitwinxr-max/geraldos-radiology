# GeraldOS — Multi-stage Next.js 16 production image
# Build: docker compose build
# Run:   docker compose up
#
# The runtime image ships ONLY the lean application runtime (standalone Next.js
# server) plus a small deploy-toolchain layer:
#   - scripts/            (db-seed.mjs + admin bootstrap)
#   - drizzle/ + drizzle.config.ts + drizzle-kit (migration runner, used by
#     Render's preDeployCommand / host-side migrate)
# The deploy layer is the exact npm dependency closure of drizzle-kit + pg —
# NOT the full development toolchain (no TypeScript sources, eslint, vitest,
# etc.).

FROM node:22-alpine AS base

# ─── Install dependencies ───
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --force skips the npm 10 optional-platform check that rejects the pinned
# @esbuild/aix-ppc64 package on linux-x64; the installed tree is functionally
# identical on linux-x64 (matches CI). We deliberately do NOT use
# --omit=optional — that would strip platform binaries the build needs.
RUN npm ci --force

# ─── Build the Next.js application ───
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Lean migration/bootstrap layer (deploy-time only) ───
FROM base AS deploy
WORKDIR /app
# drizzle-kit + pg dependency closure (verified against node_modules closure).
COPY --from=deps /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/@drizzle-team ./node_modules/@drizzle-team
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/@esbuild-kit ./node_modules/@esbuild-kit
COPY --from=deps /app/node_modules/buffer-from ./node_modules/buffer-from
COPY --from=deps /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=deps /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
COPY --from=deps /app/node_modules/source-map ./node_modules/source-map
COPY --from=deps /app/node_modules/source-map-support ./node_modules/source-map-support
COPY --from=deps /app/node_modules/xtend ./node_modules/xtend
COPY --from=deps /app/node_modules/pg ./node_modules/pg
COPY --from=deps /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=deps /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps /app/node_modules/split2 ./node_modules/split2
COPY --from=deps /app/node_modules/.bin ./node_modules/.bin
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY scripts ./scripts
COPY package.json ./
RUN mkdir -p /app/node_modules/.bin && \
    if [ ! -e /app/node_modules/.bin/drizzle-kit ]; then \
      ln -s ../drizzle-kit/bin.cjs /app/node_modules/.bin/drizzle-kit; \
    fi && \
    ./node_modules/.bin/drizzle-kit --version >/dev/null && \
    node -e "import('./scripts/lib/admin-bootstrap.mjs').then(m => { if (typeof m.bootstrapAdmin !== 'function') process.exit(1); })" && \
    echo "deploy toolchain ok"

# ─── Production runner ───
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Deploy toolchain (migrations + bootstrap) — read-only at runtime.
COPY --from=deploy /app/scripts ./scripts
COPY --from=deploy /app/drizzle ./drizzle
COPY --from=deploy /app/drizzle.config.ts ./
COPY --from=deploy /app/node_modules ./node_modules
COPY --from=deploy /app/package.json ./

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
