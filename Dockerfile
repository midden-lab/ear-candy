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

# Stage 3: Production runner
FROM node:20-alpine AS runner
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /server/dist ./dist
COPY --from=client-builder /client/dist ./dist/client
RUN mkdir -p data/uploads
ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server.js"]
