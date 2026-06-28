FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY prisma ./prisma/
COPY src ./src/
COPY tsconfig.json ./

RUN bun run postinstall

# Créer le dossier data pour SQLite
RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "run", "db:push", "&&", "bun", "src/index.ts"]