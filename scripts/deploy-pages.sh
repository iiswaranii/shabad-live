#!/usr/bin/env bash
# Builds the web app and publishes it to the gh-pages branch of origin.
# The kirtan model (models-dist/, ~280 MB, not in the main branch) is published under /models/
# and kept between deploys, so it is uploaded only when it changes.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run web:build
remote=$(git remote get-url origin)
tmp=$(mktemp -d)
if git clone -q --depth 1 --branch gh-pages "$remote" "$tmp" 2>/dev/null; then
  find "$tmp" -mindepth 1 -maxdepth 1 ! -name .git ! -name models -exec rm -rf {} +
else
  (cd "$tmp" && git init -q && git checkout -q -b gh-pages)
fi
cp -R apps/mobile/dist/. "$tmp"
if [ -d models-dist ]; then mkdir -p "$tmp/models" && rsync -a --delete models-dist/ "$tmp/models/"; fi
cd "$tmp"
git add -A
git commit -q -m "Publish web app $(date -u +%Y-%m-%dT%H:%MZ)" || echo "nothing changed"
git -c http.postBuffer=524288000 push -q "$remote" gh-pages
echo "published to gh-pages"
