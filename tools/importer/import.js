#!/usr/bin/env node
// Imports verified Gurbani from the Shabad OS SQLite database into corpus packs.
//
//   node tools/importer/import.js --db <shabados.sqlite> [--sources 1,3,5] [--out corpus]
//
// The database stores Gurmukhi in an ASCII font encoding. gurmukhi-utils (GPL-3.0,
// maintained by Shabad OS) converts it to Unicode. It runs only here, at import time.
// Original text is kept for display; the search index is derived from it at load time
// and never written back over it.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const g = require('gurmukhi-utils');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
if (!args.db) {
  console.error('usage: import.js --db <shabados.sqlite> [--sources 1,3,5] [--out corpus]');
  process.exit(2);
}
const sourceIds = (args.sources || '1').split(',').map(Number);
const outDir = path.resolve(args.out || 'corpus');
fs.mkdirSync(outDir, { recursive: true });

const db = new DatabaseSync(args.db, { readOnly: true });
// Shabad OS marks some raag headings with subscript footnote digits (e.g. "ਗਉੜੀ₂").
// The notes themselves are not in the pack, so the markers are removed and counted.
const FOOTNOTE = /[\u2080-\u2089]/g;
let footnotesRemoved = 0;
const uni = (ascii) => {
  const t = g.toUnicode(g.stripVishraams(ascii)).replace(/\s+/g, ' ').trim();
  const m = t.match(FOOTNOTE);
  if (m) footnotesRemoved += m.length;
  return t.replace(FOOTNOTE, '');
};
const uniName = (ascii) => g.toUnicode(ascii).replace(/\s+/g, ' ').trim();

const writers = Object.fromEntries(
  db.prepare('select id, name_gurmukhi, name_english from writers').all()
    .map((w) => [w.id, { pa: uniName(w.name_gurmukhi), en: w.name_english }]),
);
const sections = Object.fromEntries(
  db.prepare('select id, name_gurmukhi, name_english from sections').all()
    .map((s) => [s.id, { pa: uniName(s.name_gurmukhi), en: s.name_english }]),
);

// Characters allowed in display text after conversion: Gurmukhi block, dandas, space.
// Gurmukhi block, dandas, space; '-' and ':' are Shabad OS conventions in Persian (Bhai Nand Lal).
const ALLOWED = /^[\u0A00-\u0A7F\u0964\u0965 :-]+$/;

const manifest = { format: 'shabad-live-corpus-manifest@1', packs: [] };
const report = [];

for (const sourceId of sourceIds) {
  const src = db.prepare('select * from sources where id = ?').get(sourceId);
  if (!src) throw new Error(`source ${sourceId} not found`);
  const rows = db.prepare(`
    select l.id, l.shabad_id, l.source_page, l.source_line, l.gurmukhi, l.type_id, l.order_id,
           s.order_id as shabad_order, s.writer_id, s.section_id, s.source_id
    from lines l join shabads s on s.id = l.shabad_id
    where s.source_id = ? order by l.order_id`).all(sourceId);

  const problems = [];
  const warnings = [];
  footnotesRemoved = 0;
  const shabads = [];
  const seenShabad = new Map();
  const seenLine = new Set();
  let prevPage = -Infinity;
  let prevShabadOrder = -Infinity;
  let current = null;

  for (const r of rows) {
    if (seenLine.has(r.id)) problems.push(`duplicate line id ${r.id}`);
    seenLine.add(r.id);
    if (r.source_page < prevPage) warnings.push(`page goes backwards at line ${r.id} (${prevPage} -> ${r.source_page})`);
    prevPage = r.source_page;

    if (!current || current.id !== r.shabad_id) {
      // Boundary check: a shabad's lines must be one contiguous run in source order.
      if (seenShabad.has(r.shabad_id)) problems.push(`shabad ${r.shabad_id} is split into non-contiguous runs (line ${r.id})`);
      if (r.shabad_order < prevShabadOrder) problems.push(`shabad order goes backwards at ${r.shabad_id}`);
      prevShabadOrder = r.shabad_order;
      current = { id: r.shabad_id, order: r.shabad_order, writer: r.writer_id, section: r.section_id, lines: [] };
      seenShabad.set(r.shabad_id, current);
      shabads.push(current);
    }

    const text = uni(r.gurmukhi);
    if (!text) problems.push(`empty line ${r.id}`);
    else if (!ALLOWED.test(text)) problems.push(`unexpected characters after conversion in ${r.id}: ${JSON.stringify(text)}`);
    current.lines.push([r.id, r.source_page, r.type_id, text]);
  }

  const emptyShabads = shabads.filter((s) => s.lines.length === 0).length;
  if (emptyShabads) problems.push(`${emptyShabads} shabads have no lines`);

  const slug = src.name_english.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pack = {
    format: 'shabad-live-corpus@1',
    provenance: {
      dataset: 'Shabad OS Database',
      version: '4.8.7',
      url: 'https://github.com/ShabadOS/database',
      gurbaniLicence: 'Public Domain Mark 1.0',
      structureLicence: 'CC BY-SA 4.0 (Shabad OS IDs and organisation)',
      converter: 'gurmukhi-utils 3.2.2 toUnicode(stripVishraams(x))',
      importedAt: new Date().toISOString().slice(0, 10),
      verification: 'imported; boundary checks below; proofreading against a printed saroop still required',
    },
    source: {
      id: src.id,
      nameEn: src.name_english,
      namePa: uniName(src.name_gurmukhi),
      pageNameEn: src.page_name_english,
      pageNamePa: uniName(src.page_name_gurmukhi),
      length: src.length,
    },
    writers,
    sections,
    lineTypes: { 1: 'Manglacharan', 2: 'Sirlekh', 3: 'Rahao', 4: 'Pankti' },
    shabads,
  };
  const file = `${slug}.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(pack));
  const bytes = fs.statSync(path.join(outDir, file)).size;
  manifest.packs.push({ file, sourceId: src.id, nameEn: src.name_english, namePa: pack.source.namePa, shabads: shabads.length, lines: rows.length, bytes });
  report.push({ source: src.name_english, shabads: shabads.length, lines: rows.length, bytes, problems, warnings, footnotesRemoved });
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const md = ['# Corpus import report', '', `Database: Shabad OS 4.8.7 · imported ${new Date().toISOString().slice(0, 10)}`, ''];
for (const r of report) {
  md.push(`## ${r.source}`, '', `- Shabads: ${r.shabads}`, `- Lines: ${r.lines}`, `- Pack size: ${(r.bytes / 1e6).toFixed(1)} MB`,
    `- Footnote markers removed from headings: ${r.footnotesRemoved}`,
    `- Boundary / encoding errors: ${r.problems.length}`, ...r.problems.slice(0, 50).map((p) => `  - ${p}`),
    `- Warnings (source data, kept as-is): ${r.warnings.length}`, ...r.warnings.slice(0, 20).map((p) => `  - ${p}`), '');
}
fs.writeFileSync(path.join(outDir, 'IMPORT_REPORT.md'), md.join('\n'));
console.log(md.join('\n'));
if (report.some((r) => r.problems.length)) process.exitCode = 1;
