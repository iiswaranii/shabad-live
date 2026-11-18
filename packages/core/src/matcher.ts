import type { Corpus, Line } from './corpus';
import { joinTokens, type Token } from './normalize';

export interface LineHit {
  line: Line;
  /** Local-alignment score in IDF units: rare matched words count more than common ones. */
  score: number;
  matchedCount: number;
  matchedWeight: number;
  /** Fraction of the line's evidence weight that was heard. */
  coverage: number;
  /** Last query token index the alignment used (recency of the evidence inside the window). */
  queryEnd: number;
}

export function tokenSim(q: Token, l: Token): number {
  if (q.loose !== null && l.loose !== null && q.loose === l.loose) return 1;
  if (q.skel === l.skel) return 0.85;
  const m = Math.max(q.skel.length, l.skel.length);
  if (m < 3) return 0;
  const r = 1 - levenshtein(q.skel, l.skel) / m;
  return r >= 0.6 ? 0.7 * r : 0;
}

function levenshtein(a: string, b: string): number {
  const prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const QUERY_GAP = 0.6; // an extra heard word (audience, filler, ASR noise)
const LINE_GAP = 0.25; // a missed word, scaled by its weight
const MISMATCH = 0.8;

/**
 * Smith-Waterman local alignment of the heard tokens against one line, with
 * word-level transpositions ("nearby swaps"). Returns null if nothing aligns.
 */
export function align(query: Token[], line: Line): LineHit | null {
  const n = query.length, m = line.tokens.length;
  if (!n || !m) return null;
  const W = line.weights;
  const H: Float64Array[] = [];
  const MW: Float64Array[] = []; // matched weight along the best path
  const MC: Int32Array[] = []; // matched count along the best path
  for (let i = 0; i <= n; i++) { H.push(new Float64Array(m + 1)); MW.push(new Float64Array(m + 1)); MC.push(new Int32Array(m + 1)); }
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = tokenSim(query[i - 1], line.tokens[j - 1]);
      let h = 0, mw = 0, mc = 0;
      const d = H[i - 1][j - 1] + (sim > 0 ? sim * W[j - 1] : -MISMATCH);
      if (d > h) { h = d; mw = MW[i - 1][j - 1] + (sim > 0 ? W[j - 1] : 0); mc = MC[i - 1][j - 1] + (sim > 0 ? 1 : 0); }
      const up = H[i - 1][j] - QUERY_GAP;
      if (up > h) { h = up; mw = MW[i - 1][j]; mc = MC[i - 1][j]; }
      const left = H[i][j - 1] - Math.min(1.5, LINE_GAP * W[j - 1]);
      if (left > h) { h = left; mw = MW[i][j - 1]; mc = MC[i][j - 1]; }
      if (i >= 2) {
        // Two heard tokens that are one line word split by the recogniser.
        const js = tokenSim(joinTokens(query[i - 2], query[i - 1]), line.tokens[j - 1]);
        if (js > 0) {
          const jn = H[i - 2][j - 1] + 0.9 * js * W[j - 1];
          if (jn > h) { h = jn; mw = MW[i - 2][j - 1] + W[j - 1]; mc = MC[i - 2][j - 1] + 1; }
        }
      }
      if (i >= 2 && j >= 2) {
        const s1 = tokenSim(query[i - 1], line.tokens[j - 2]);
        const s2 = tokenSim(query[i - 2], line.tokens[j - 1]);
        if (s1 > 0 && s2 > 0) {
          const t = H[i - 2][j - 2] + 0.9 * (s1 * W[j - 2] + s2 * W[j - 1]);
          if (t > h) { h = t; mw = MW[i - 2][j - 2] + W[j - 2] + W[j - 1]; mc = MC[i - 2][j - 2] + 2; }
        }
      }
      H[i][j] = h; MW[i][j] = mw; MC[i][j] = mc;
      if (h > best) { best = h; bi = i; bj = j; }
    }
  }
  if (best <= 0) return null;
  const matchedWeight = MW[bi][bj];
  return { line, score: best, matchedCount: MC[bi][bj], matchedWeight, coverage: matchedWeight / line.weight, queryEnd: bi - 1 };
}

export interface SearchOptions {
  /** Candidate lines to align after retrieval. */
  limit?: number;
  /** Restrict to these line indices (live tracking inside one shabad). */
  within?: number[];
}

/**
 * Retrieve candidate lines with ordered word-pair keys (adjacent and skip-one) and rare
 * single words, then score each with `align`. Searches the entire loaded corpus.
 */
export function search(corpus: Corpus, query: Token[], opts: SearchOptions = {}): LineHit[] {
  if (query.length === 0) return [];
  let candidates: number[];
  if (opts.within) {
    candidates = opts.within;
  } else {
    const acc = new Map<number, number>();
    const add = (idxs: number[] | undefined, w: number) => {
      if (!idxs) return;
      for (const i of idxs) acc.set(i, (acc.get(i) ?? 0) + w);
    };
    const seen = new Set<string>();
    for (let i = 0; i < query.length; i++) {
      for (const k of [1, 2]) {
        if (i + k >= query.length) continue;
        const key = `${query[i].skel} ${query[i + k].skel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(corpus.postings.get(key), corpus.idf(query[i].skel) + corpus.idf(query[i + k].skel));
      }
      const u = query[i].skel;
      if (!seen.has(u)) { seen.add(u); add(corpus.unigramPostings.get(u), corpus.idf(u) * 0.5); }
    }
    candidates = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.limit ?? 200).map(([i]) => i);
  }
  const hits: LineHit[] = [];
  for (const i of candidates) {
    const line = corpus.lines[i];
    if (!line.indexed) continue;
    const h = align(query, line);
    if (h) hits.push(h);
  }
  return hits.sort((a, b) => b.score - a.score);
}
