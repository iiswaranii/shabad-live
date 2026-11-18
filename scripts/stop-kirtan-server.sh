#!/usr/bin/env bash
# Stops the kirtan server, its public tunnel and the keep-awake started with it.
cd "$(dirname "$0")/.."
for f in tunnel api caffeinate; do
  [ -f .server/$f.pid ] && kill "$(cat .server/$f.pid)" 2>/dev/null && echo "stopped $f"
  rm -f .server/$f.pid
done
pkill -f "services/api/src/server.ts" 2>/dev/null || true
