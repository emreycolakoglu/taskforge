#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting TaskForge..."
exec node dist/main.js