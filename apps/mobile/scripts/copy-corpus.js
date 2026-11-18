// Copies the corpus packs into public/ so the web build serves them next to the page.
const fs = require('node:fs');
const path = require('node:path');
const src = path.resolve(__dirname, '../../../corpus');
const dst = path.resolve(__dirname, '../public/corpus');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) if (f.endsWith('.json')) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log(`corpus copied to ${dst}`);
