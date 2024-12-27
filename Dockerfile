# Stage 1: Builder
FROM oven/bun:1 AS builder
WORKDIR /app

# Salin file penting
COPY package.json bun.lockb ./
COPY src ./src
COPY tsconfig.json ./ 

# Install dependencies
RUN bun install --no-cache

# Build aplikasi dengan target node
RUN bun build ./src/index.ts --target=node --outdir=dist

# Stage 2: Runner (Production)
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Salin hasil build dari stage builder
COPY --from=builder /app/dist ./dist
COPY package.json ./    

# Set up environment
ENV PORT=8101
EXPOSE 8101

# Jalankan aplikasi
CMD ["bun", "dist/index.js"]
