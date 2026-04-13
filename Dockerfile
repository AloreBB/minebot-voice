# Stage 1: Install + Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json yarn.lock turbo.json ./
COPY apps/bot/package.json apps/bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install dependencies (increase timeout for large packages like minecraft-data)
RUN yarn config set network-timeout 600000 && yarn install --frozen-lockfile

# Copy source
COPY apps/ apps/
COPY packages/ packages/

# Build shared types, then web (vite), then bot (tsc)
RUN yarn turbo build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/apps/bot/package.json apps/bot/
COPY --from=builder /app/packages/shared/package.json packages/shared/

# Install production deps only
RUN yarn install --frozen-lockfile --production

# Copy built outputs
COPY --from=builder /app/apps/bot/dist apps/bot/dist/
COPY --from=builder /app/apps/web/dist apps/web/dist/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

EXPOSE 3001

CMD ["node", "apps/bot/dist/server.js"]
