# Stage 1: Build React client
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Build Fastify server TypeScript (no native addons)
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS server-builder
WORKDIR /server
COPY server/package*.json ./
RUN npm ci --ignore-scripts
COPY server/ ./
RUN npm run build

# Stage 3: Install production deps, compiling native addons (bcrypt,
# better-sqlite3) here. Build tools live only in this stage so they never
# reach the final image.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev

# Stage 4: Production runner — compiled output only, no compilers
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/package*.json ./
COPY --from=server-builder /server/dist ./dist
COPY --from=client-builder /client/dist ./dist/client
RUN mkdir -p data/uploads
# Run as the base image's built-in non-root `node` user (uid/gid 1000,
# already present in every official node:*-alpine image, not something
# this Dockerfile invents) instead of root — a remote-code-execution bug
# in the app or a dependency would otherwise grant root inside the
# container immediately, skipping the privilege-escalation step an
# attacker would otherwise need (issue #36). `chown -R` covers
# node_modules/dist (read-only at runtime, but still must be readable by
# a non-owning, non-root user) and the placeholder data/ dir — in
# production this directory is shadowed by the -v bind mount to
# /opt/ear-candy/data on the host, so ownership there is handled
# separately by the deploy job (chown to the matching uid 1000 before
# starting the container — see .github/workflows/ci-cd.yml and
# scripts/setup-droplet.sh), but CI's e2e job runs this image with no
# volume mount at all, so the in-image ownership is what makes that
# ephemeral case work.
RUN chown -R node:node /app
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
