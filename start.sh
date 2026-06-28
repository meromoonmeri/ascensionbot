#!/bin/sh
set -e

echo "🔄 Push du schéma en base..."
bunx prisma db push --skip-generate

echo "✅ Schéma poussé. Démarrage du bot..."
bun src/index.ts