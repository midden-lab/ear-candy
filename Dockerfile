# Stage 1: Build React client
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Build Fastify server TypeScript (no native addons)
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS server-builder
WORKDIR /server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# Stage 3: Install production deps, compiling native addons (bcrypt,
# better-sqlite3) here. Build tools live only in this stage so they never
# reach the final image.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

# Stage 4: Production runner — compiled output only, no compilers
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/package*.json ./
COPY --from=server-builder /server/dist ./dist
COPY --from=client-builder /client/dist ./dist/client
RUN mkdir -p data/uploads
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
