# =====================================================
# Viet-Contech Backend — Dockerfile (multi-stage)
# Stage 1: builder — compile TypeScript -> dist/
# Stage 2: runner  — node + dist + production deps only
# =====================================================

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

# build-base + python can thiet neu sau nay them better-sqlite3 / native module
# (alpine khong co san, them o day cho an toan; runner image se khong co)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy manifest truoc de tan dung Docker layer cache
# Khi package*.json khong doi -> reuse layer npm ci -> build sieu nhanh
COPY package.json package-lock.json* ./

# Install full deps (gom dev) de chay tsc
RUN npm ci --no-audit --no-fund

# Copy toan bo source roi build
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript -> dist/
RUN npm run build

# Cat node_modules: chi giu production -> copy sang runner
RUN npm prune --omit=dev

# ---------- Stage 2: runner ----------
FROM node:20-alpine AS runner

# Cai curl cho HEALTHCHECK + libc6-compat cho native binary
RUN apk add --no-cache curl libc6-compat

# Khong chay duoi root — alpine da co user "node" (uid 1000)
WORKDIR /app

# Set production env de Hono / Node toi uu
ENV NODE_ENV=production
ENV PORT=8787

# Copy artifact tu builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Copy db/ (migration SQL files) — runtime co the can de bootstrap
COPY --chown=node:node db ./db

# Tao thu muc /app/data cho SQLite persistence
# Volume se mount vao day, code phai ghi DB_PATH=/app/data/vct.db
RUN mkdir -p /app/data && chown -R node:node /app/data

# Volume mount point cho data persistence (SQLite db)
VOLUME ["/app/data"]

USER node

EXPOSE 8787

# Healthcheck — Railway / Fly / Docker Swarm deu hieu
# interval 30s, timeout 5s, retries 3, start_period 10s cho cold start
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:8787/healthz || exit 1

CMD ["node", "dist/server.js"]
