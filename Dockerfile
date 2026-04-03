# Stage 1: Install dependencies
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install

# Stage 2: Build frontend + bundle server
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Stage 3: Production image
FROM node:22-slim AS production
WORKDIR /app
RUN corepack enable pnpm

# Copy built output
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
