#!/usr/bin/env bash
# Builds the web app and publishes apps/mobile/dist to the gh-pages branch of origin.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run web:build
remote=$(git remote get-url origin)
tmp=$(mktemp -d)
cp -R apps/mobile/dist/. "$tmp"
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Publish web app $(date -u +%Y-%m-%dT%H:%MZ)"
git push -q --force "$remote" gh-pages
echo "published to gh-pages"
