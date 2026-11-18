#!/usr/bin/env tsx
// Command-line recogniser: the first runnable milestone.
//
//   shabad synth     --corpus corpus --out fixtures/synthetic
//   shabad recognize --corpus corpus --clips fixtures/synthetic/manifest.json [--clip ID] [--json]
//   shabad eval      --corpus corpus --clips fixtures/synthetic/manifest.json [--split eval|tune|all] [--report docs/EVALUATION.md]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import {
  Corpus, RecognitionSession, simulate, kirtanPlan, structure, PROFILES, rng,
  type CorpusPack, type EngineResponse, type SimWindow, type TruthSegment, type PlanStep,
} from '@shabad/core';

const [cmd, ...rest] = process.argv.slice(2);
const args: Record<string, string> = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) args[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? 'true' : rest[++i];

function loadCorpus(dir: string, sources?: string): Corpus {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { packs: { file: string; sourceId: number }[] };
  const wanted = sources ? new Set(sources.split(',').map(Number)) : new Set([1, 3, 5]);
  const packs = manifest.packs.filter((p) => wanted.has(p.sourceId)).map((p) => JSON.parse(readFileSync(join(dir, p.file), 'utf8')) as CorpusPack);
  const t = Date.now();
  const c = Corpus.fromPacks(packs);
  console.error(`corpus: ${packs.map((p) => p.source.nameEn).join(', ')} — ${JSON.stringify(c.stats())} (${Date.now() - t} ms)`);
  return c;
}

// ------------------------------------------------------------------ input format

interface Clip {
  id: string;
  /** Label: the shabad actually performed. */
  shabadId: string;
  split: 'tune' | 'eval';
  synthetic: boolean;
  performance: { id: string; profile?: string; note?: string };
  /** Either recogniser windows, or an audio file that needs an ASR adapter. */
  windows?: SimWindow[];
  audio?: string;
  truth: TruthSegment[];
}
interface ClipManifest { format: 'shabad-live-clips@1'; synthetic: boolean; note: string; clips: (Clip | { file: string })[] }

function loadClips(path: string): Clip[] {
  const m = JSON.parse(readFileSync(path, 'utf8')) as ClipManifest;
  return m.clips.map((c) => ('file' in c ? JSON.parse(readFileSync(join(dirname(path), c.file), 'utf8')) : c));
}

// ------------------------------------------------------------------ synth

function synth(c: Corpus, out: string) {
  mkdirSync(join(out, 'clips'), { recursive: true });
  const r = rng(20261118);
  // Shabads that share a pangti with another shabad (both members of each pair are included).
  const sharedPairs = [['QNL', '5BC'], ['2GS', 'KF2']];
  const fixed = ['MRB', ...sharedPairs.flat()];
  const pool = [...c.shabads.values()].filter((s) => {
    if (s.sourceId !== 1 || fixed.includes(s.id)) return false;
    const st = structure(c, s.id);
    return st.rahao.length > 0 && st.verses.length >= 3 && st.verses.length <= 6;
  });
  const chosen = [...fixed];
  while (chosen.length < 10) {
    const s = pool[Math.floor(r() * pool.length)].id;
    if (!chosen.includes(s)) chosen.push(s);
  }
  const performances = [
    { id: 'A', profile: 'clear_close', split: 'tune' as const },
    { id: 'B', profile: 'unseen_raagi', split: 'eval' as const },
    { id: 'C', profile: 'distant_phone', split: 'eval' as const },
    { id: 'D', profile: 'hindi_asr', split: 'eval' as const },
  ];
  const entries: { file: string }[] = [];
  chosen.forEach((shabadId, si) => {
    performances.forEach((p, pi) => {
      // Each performance has its own plan: different starting verse, repeats, skips.
      const seed = 1000 + si * 10 + pi;
      let plan: PlanStep[] = kirtanPlan(c, shabadId, seed);
      const { rahao } = structure(c, shabadId);
      if (rahao[0] && (sharedPairs.flat().includes(shabadId) || r() < 0.4)) {
        // Open with the refrain (asthayi), sung twice, as kirtan often does.
        plan = [{ instrumentalSec: 4 }, { lineId: rahao[0].id }, { lineId: rahao[0].id }, ...plan.slice(1)];
      }
      const sim = simulate(c, plan, PROFILES[p.profile], seed);
      const clip: Clip = {
        id: `${shabadId}-${p.id}`, shabadId, split: p.split, synthetic: true,
        performance: { id: p.id, profile: p.profile, note: 'SYNTHETIC recogniser output generated from verified corpus text; not audio' },
        windows: sim.windows, truth: sim.truth,
      };
      const file = `clips/${clip.id}.json`;
      writeFileSync(join(out, file), JSON.stringify(clip));
      entries.push({ file });
    });
  });
  const manifest: ClipManifest = {
    format: 'shabad-live-clips@1', synthetic: true,
    note: 'SYNTHETIC FIXTURES. Simulated recogniser windows for software testing and threshold tuning. They do not measure real-world recognition accuracy.',
    clips: entries,
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${entries.length} synthetic clips for ${chosen.length} shabads: ${chosen.join(', ')}`);
}

// ------------------------------------------------------------------ recognize

interface Run { clip: Clip; responses: EngineResponse[] }

function run(c: Corpus, clip: Clip): Run | null {
  if (!clip.windows) {
    console.error(`skip ${clip.id}: audio input needs an ASR adapter (none configured). Provide recogniser windows; see docs/INPUT_FORMATS.md.`);
    return null;
  }
  const s = new RecognitionSession(c, clip.id);
  const responses = clip.windows.map((w, i) => s.process({ sessionId: clip.id, seq: i + 1, ...w })!);
  return { clip, responses };
}

function describe(c: Corpus, r: EngineResponse): string {
  const ln = (id: string | null) => (id ? `${id} ${c.lineById.get(id)!.text.slice(0, 48)}` : '—');
  switch (r.status) {
    case 'ambiguous': return `AMBIGUOUS heard="${r.heard.text.slice(0, 40)}" candidates=${r.candidates.slice(0, 6).map((x) => `${x.shabadId}(${x.match === 'exact' ? '=' : '~'}${x.support}, Ang ${x.source.page})`).join(' ')}${r.candidates.length > 6 ? ` +${r.candidates.length - 6}` : ''}`;
    case 'resolved': return `RESOLVED ${r.shabadId} [${r.selectedBy}] ${r.lineStatus.toUpperCase()} line=${ln(r.currentLineId)}`;
    case 'uncertain_line': return `UNCERTAIN ${r.shabadId} paused; possible=${r.possibleLineIds.join(',')} last=${ln(r.lastLineId)}`;
    default: return r.status.toUpperCase();
  }
}

function recognize(c: Corpus, clips: Clip[], json: boolean) {
  for (const clip of clips) {
    const res = run(c, clip);
    if (!res) continue;
    if (json) { console.log(JSON.stringify({ clip: clip.id, label: clip.shabadId, decisions: res.responses })); continue; }
    console.log(`\n=== ${clip.id}  label=${clip.shabadId}  split=${clip.split}  ${clip.synthetic ? 'SYNTHETIC' : ''}`);
    let prev = '';
    res.responses.forEach((r, i) => {
      const d = describe(c, r);
      if (d !== prev) console.log(`  t=${r.t1.toFixed(1).padStart(6)}s  ${d}   (${r.reason})   heard: ${clip.windows![i].text.slice(0, 50)}`);
      prev = d;
    });
    const ev = evidence(res);
    console.log(`  candidates seen: ${ev.candidates.join(', ') || 'none'}`);
    console.log(`  evidence lines for opened shabad: ${ev.lines.join(', ') || 'none'}`);
  }
}

function evidence(r: Run) {
  const candidates = new Set<string>();
  let lines: string[] = [];
  for (const x of r.responses) {
    if (x.status === 'ambiguous') x.candidates.forEach((k) => candidates.add(k.shabadId));
    if (x.status === 'resolved') { candidates.add(x.shabadId); lines = x.matchedLineIds; }
  }
  return { candidates: [...candidates], lines };
}

// ------------------------------------------------------------------ eval

interface ClipMetrics {
  id: string; split: string; profile: string;
  autoOpened: string | null; firstAutoCorrect: boolean; finalCorrect: boolean; wrongAutoOpens: number;
  unresolved: boolean; candidateRecall: boolean; idDelaySec: number | null;
  lineWindows: number; lineAsserted: number; lineCorrect: number; settledAsserted: number; settledCorrect: number; instrumentalFalseMoves: number;
  delays: number[]; missedSegments: number; segments: number;
}

function evaluate(c: Corpus, r: Run): ClipMetrics {
  const { clip, responses } = r;
  const truthAt = (t: number) => clip.truth.find((s) => t > s.t0 && t <= s.t1) ?? null;
  const firstSung = clip.truth.find((s) => s.lineId)?.t0 ?? 0;
  const sameText = (a: string | null, b: string | null) => !!a && !!b && c.lineById.get(a)!.group === c.lineById.get(b)!.group;

  let autoOpened: string | null = null, wrongAuto = 0, recall = false, idDelay: number | null = null, prevOpen: string | null = null;
  let lineWindows = 0, lineAsserted = 0, lineCorrect = 0, settledAsserted = 0, settledCorrect = 0, falseMoves = 0, prevLine: string | null = null;
  let correctOpenAt: number | null = null;
  for (const x of responses) {
    if (x.status === 'ambiguous' && x.candidates.some((k) => k.shabadId === clip.shabadId)) recall = true;
    if (x.status === 'resolved' || x.status === 'uncertain_line') {
      if (x.shabadId === clip.shabadId) recall = true;
      if (x.selectedBy === 'auto' && x.shabadId !== prevOpen) {
        if (!autoOpened) autoOpened = x.shabadId;
        if (x.shabadId !== clip.shabadId) wrongAuto++;
        else if (correctOpenAt === null) { correctOpenAt = x.t1; idDelay = x.t1 - firstSung; }
      }
      prevOpen = x.shabadId;
    } else prevOpen = null;

    if (x.status === 'resolved' && x.shabadId === clip.shabadId) {
      const seg = truthAt(x.t1);
      if (seg?.lineId) {
        lineWindows++;
        if (x.lineStatus === 'live' && x.currentLineId) {
          const ok = sameText(x.currentLineId, seg.lineId);
          lineAsserted++; if (ok) lineCorrect++;
          // Excluding the first 3 s after a line change, while the window still holds the previous line.
          if (x.t1 - seg.t0 > 3) { settledAsserted++; if (ok) settledCorrect++; }
        }
      } else if (seg && x.currentLineId !== prevLine && prevLine !== null) falseMoves++;
      prevLine = x.currentLineId;
    } else if (x.status === 'uncertain_line' && x.shabadId === clip.shabadId) {
      const seg = truthAt(x.t1);
      if (seg?.lineId) lineWindows++;
    }
  }

  // Highlight delay: from when a line starts being sung to when the live marker shows it.
  const delays: number[] = [];
  let missed = 0, segments = 0;
  if (correctOpenAt !== null) {
    for (const seg of clip.truth) {
      if (!seg.lineId || seg.t0 < correctOpenAt) continue;
      segments++;
      const hit = responses.find((x) => x.t1 > seg.t0 && x.t1 <= seg.t1 + 3 && x.status === 'resolved' && x.lineStatus === 'live' && sameText(x.currentLineId, seg.lineId));
      if (hit) delays.push(hit.t1 - seg.t0); else missed++;
    }
  }
  const last = responses[responses.length - 1];
  const finalShabad = last && (last.status === 'resolved' || last.status === 'uncertain_line') ? last.shabadId : null;
  return {
    id: clip.id, split: clip.split, profile: clip.performance.profile ?? clip.performance.id,
    autoOpened, firstAutoCorrect: autoOpened === clip.shabadId, finalCorrect: finalShabad === clip.shabadId, wrongAutoOpens: wrongAuto,
    unresolved: autoOpened === null, candidateRecall: recall, idDelaySec: idDelay,
    lineWindows, lineAsserted, lineCorrect, settledAsserted, settledCorrect, instrumentalFalseMoves: falseMoves, delays, missedSegments: missed, segments,
  };
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const quant = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function summarise(ms: ClipMetrics[]) {
  const n = ms.length;
  const delays = ms.flatMap((m) => m.delays);
  const ids = ms.map((m) => m.idDelaySec).filter((x): x is number => x !== null);
  const sum = (f: (m: ClipMetrics) => number) => ms.reduce((a, m) => a + f(m), 0);
  return {
    clips: n,
    correctIdentification: pct(ms.filter((m) => m.firstAutoCorrect).length, n),
    correctAtEnd: pct(ms.filter((m) => m.finalCorrect).length, n),
    wrongAutomaticOpens: `${sum((m) => m.wrongAutoOpens)} in ${n} clips`,
    unresolved: pct(ms.filter((m) => m.unresolved).length, n),
    candidateRecall: pct(ms.filter((m) => m.candidateRecall).length, n),
    identificationDelayMedianSec: quant(ids, 0.5).toFixed(1),
    lineAccuracyStrict: pct(sum((m) => m.lineCorrect), sum((m) => m.lineAsserted)),
    lineAccuracySettled: pct(sum((m) => m.settledCorrect), sum((m) => m.settledAsserted)),
    lineAssertedShare: pct(sum((m) => m.lineAsserted), sum((m) => m.lineWindows)),
    instrumentalFalseMoves: sum((m) => m.instrumentalFalseMoves),
    highlightDelayMedianSec: quant(delays, 0.5).toFixed(1),
    highlightDelayP90Sec: quant(delays, 0.9).toFixed(1),
    linesNeverHighlighted: pct(sum((m) => m.missedSegments), sum((m) => m.segments)),
  };
}

function evalCmd(c: Corpus, clips: Clip[], split: string, reportPath?: string) {
  const runs = clips.map((k) => run(c, k)).filter((x): x is Run => !!x);
  const metrics = runs.map((r) => evaluate(c, r));
  const groups: Record<string, ClipMetrics[]> = {
    'tune (A: clear_close)': metrics.filter((m) => m.split === 'tune'),
    'eval — all held-out': metrics.filter((m) => m.split === 'eval'),
    ...Object.fromEntries(['unseen_raagi', 'distant_phone', 'hindi_asr'].map((p) => [`eval — ${p}`, metrics.filter((m) => m.split === 'eval' && m.profile === p)])),
  };
  const selected = split === 'all' ? groups : Object.fromEntries(Object.entries(groups).filter(([k]) => k.startsWith(split)));
  const table = Object.fromEntries(Object.entries(selected).map(([k, v]) => [k, summarise(v)]));
  console.table(table);
  const failures = metrics.filter((m) => !m.firstAutoCorrect || m.wrongAutoOpens).map((m) => `${m.id}: opened ${m.autoOpened ?? 'nothing'}${m.wrongAutoOpens ? `, ${m.wrongAutoOpens} wrong auto-open(s)` : ''}`);
  if (failures.length) console.log('clips not correctly auto-opened:\n  ' + failures.join('\n  '));
  if (reportPath) writeReport(reportPath, table, failures, metrics);
}

function writeReport(path: string, table: Record<string, ReturnType<typeof summarise>>, failures: string[], metrics: ClipMetrics[]) {
  const keys = Object.keys(Object.values(table)[0]) as (keyof ReturnType<typeof summarise>)[];
  const cols = Object.keys(table);
  const md = [
    '# Evaluation',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval\`.`,
    '',
    '> **Measured on SYNTHETIC recogniser output only.** These numbers test the matching and',
    '> tracking software against simulated transcripts built from verified corpus text. **Real-world',
    '> recognition accuracy on kirtan audio is unmeasured**: no labelled recordings and no singing-tested',
    '> Punjabi ASR were available. Thresholds were tuned on the `tune` split only.',
    '',
    '## Measured (synthetic)',
    '',
    `| metric | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...keys.map((k) => `| ${k} | ${cols.map((c) => String(table[c][k])).join(' | ')} |`),
    '',
    'Corpus searched: Sri Guru Granth Sahib Ji + Vaaran Bhai Gurdas Ji + Ghazals Bhai Nand Lal Ji (full packs).',
    `Clips: ${metrics.length} (10 shabads × 4 simulated performances; performance A = tuning, B–D held out).`,
    '',
    failures.length ? '### Clips not correctly auto-opened\n\n' + failures.map((f) => `- ${f}`).join('\n') : '',
    '',
    '## Proposed targets (not yet measured on real audio)',
    '',
    '| metric | proposed target |',
    '|---|---|',
    '| wrong automatic opens | ≤ 1 per 100 sessions |',
    '| correct identification within 30 s of the first clear line | ≥ 90% |',
    '| candidate recall (true shabad listed) | ≥ 98% |',
    '| line accuracy when the marker is live | ≥ 95% |',
    '| median highlight delay | ≤ 4 s |',
    '| new line asserted during instrumental passages | 0 |',
    '',
    '## Metric definitions',
    '',
    '- **correctIdentification**: the first shabad opened automatically is the labelled one.',
    '- **correctAtEnd**: the shabad open at the end of the clip is the labelled one.',
    '- **wrongAutomaticOpens**: automatic opens of any other shabad (including later switches).',
    '- **unresolved**: nothing was opened automatically (the listener would pick from the list).',
    '- **candidateRecall**: the labelled shabad appeared in the candidate list or was opened.',
    '- **lineAccuracyStrict**: of windows where the live marker showed a line, the share whose text matches what was being sung at the end of the window.',
    '- **lineAccuracySettled**: the same, excluding the first 3 s after each line change (the transition is reported as highlight delay).',
    '- **lineAssertedShare**: share of sung windows (after opening) in which the marker was live rather than paused or not yet placed.',
    '- **instrumentalFalseMoves**: times the line changed during an instrumental gap.',
    '- **highlightDelay**: seconds from the start of a sung line to the live marker showing it; lines never shown are counted separately.',
  ];
  writeFileSync(path, md.join('\n') + '\n');
  writeFileSync(join(dirname(path), '../fixtures/synthetic/eval_results.json'), JSON.stringify({ table, metrics }, null, 2));
  console.log(`report: ${path}`);
}

// ------------------------------------------------------------------ main

const corpusDir = resolve(args.corpus ?? 'corpus');
if (cmd === 'synth') {
  synth(loadCorpus(corpusDir, args.sources), resolve(args.out ?? 'fixtures/synthetic'));
} else if (cmd === 'recognize' || cmd === 'eval') {
  const clipsPath = resolve(args.clips ?? 'fixtures/synthetic/manifest.json');
  if (!existsSync(clipsPath)) { console.error(`no clip manifest at ${clipsPath}; run \`npm run synth\` first`); process.exit(2); }
  let clips = loadClips(clipsPath);
  if (args.clip) clips = clips.filter((k) => k.id === args.clip);
  const c = loadCorpus(corpusDir, args.sources);
  if (cmd === 'recognize') recognize(c, clips, args.json === 'true');
  else evalCmd(c, clips, args.split ?? 'all', args.report);
} else {
  console.log('usage: shabad <synth|recognize|eval> [--corpus corpus] [--clips manifest.json] [--clip ID] [--split tune|eval|all] [--report docs/EVALUATION.md] [--sources 1,3,5]');
  process.exit(cmd ? 2 : 0);
}
