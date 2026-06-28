#!/bin/sh
echo "🔄 Pushing database schema..."
bunx prisma db push --skip-generate
echo "✅ Schema pushed. Starting bot..."
bun index.ts