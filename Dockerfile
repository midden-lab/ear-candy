# Stage 1: Build React client
FROM node:20-alpine AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Build Fastify server TypeScript (no native addons)
FROM node:20-alpine AS server-builder
WORKDIR /server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# Stage 3: Install production deps, compiling native addons (bcrypt,
# better-sqlite3) here. Build tools live only in this stage so they never
# reach the final image.
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

# Stage 4: Production runner — compiled output only, no compilers
FROM node:20-alpine AS runner
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
CMD ["node", "dist/server.js"]
