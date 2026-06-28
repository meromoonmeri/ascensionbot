FROM oven/bun:1-alpine

WORKDIR /app

# Install SQLite and certificates (for Discord API)
RUN apk add --no-cache sqlite ca-certificates

# Copy source
COPY package.json bun.lock schema.prisma prisma.ts index.ts start.sh tsconfig.json ./
COPY prisma/ ./prisma/

# Install dependencies
RUN bun install

# Generate Prisma client
RUN bunx prisma generate

# Create persistent data dir
RUN mkdir -p /data

# Default DB path
ENV DATABASE_URL="file:/data/bot.db"

CMD ["sh", "start.sh"]