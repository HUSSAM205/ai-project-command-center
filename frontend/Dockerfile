# syntax=docker/dockerfile:1

# ---- deps: install node_modules in its own layer, cached while only source changes ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: production Next.js build --------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined into the client JS bundle at build time, not read at
# container start — so this has to be a build ARG, matching frontend/.env.local's dev default.
# Changing it later means rebuilding the image, not just restarting the container.
# Relative by default: requests go through the same-origin rewrite proxy in next.config.ts
# (see BACKEND_ORIGIN below), so no absolute backend URL needs to be baked into the bundle.
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# DOCKER_BUILD=1 opts next.config.ts into output:"standalone" for this build (a minimal
# .next/standalone server — only the deps actually traced from the build), which the runtime
# stage below copies instead of the full node_modules tree. Vercel/plain `next build` don't set
# this and get the default output mode, since standalone breaks Vercel's own build pipeline.
ENV DOCKER_BUILD=1
RUN npm run build

# ---- runner: minimal production server ---------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
