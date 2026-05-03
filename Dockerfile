# Hoverboard: production image (API + static SPA). Requires only Docker on the host.
# Build: docker compose build   Run: docker compose up -d
#
# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/

RUN npm ci --prefix server && npm ci --prefix client

COPY server ./server
COPY client ./client

RUN npm run build --prefix client

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY hoverboard.config.json ./

EXPOSE 5179
ENV PORT=5179 \
  HOVERBOARD_DB_PATH=/data/hoverboard.sqlite \
  HOVERBOARD_UPLOADS_DIR=/data/uploads

RUN mkdir -p /data/uploads

CMD ["node", "server/index.js"]
