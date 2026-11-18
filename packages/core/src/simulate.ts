// SYNTHETIC FIXTURES ONLY.
// Simulates what a speech recogniser might emit for a kirtan performance, built from
// verified corpus lines. It is used to test the software and to tune thresholds. It is
// not audio, not a model of any real raagi, and says nothing about real-world accuracy.

import type { Corpus, Line } from './corpus';
import { gurmukhiToDevanagari, words } from './normalize';

export interface Profile {
  name: string;
  /** Probability a sung word is missing from the transcript entirely. */
  wordDrop: number;
  /** Extra per-window drop: overlapping windows do not transcribe identically. */
  windowDrop: number;
  /** Probability of a vowel-sign / nasal / aspiration change in a word. */
  spellNoise: number;
  /** Probability of a filler or audience word after a sung word. */
  filler: number;
  /** Probability a word is held long (sustained syllable). */
  sustain: number;
  wordSec: [number, number];
  script: 'gurmukhi' | 'devanagari';
}

export const PROFILES: Record<string, Profile> = {
  clear_close: { name: 'clear_close', wordDrop: 0.08, windowDrop: 0.05, spellNoise: 0.25, filler: 0.03, sustain: 0.1, wordSec: [0.5, 0.9], script: 'gurmukhi' },
  unseen_raagi: { name: 'unseen_raagi', wordDrop: 0.15, windowDrop: 0.1, spellNoise: 0.4, filler: 0.08, sustain: 0.25, wordSec: [0.6, 1.3], script: 'gurmukhi' },
  hindi_asr: { name: 'hindi_asr', wordDrop: 0.15, windowDrop: 0.1, spellNoise: 0.3, filler: 0.05, sustain: 0.2, wordSec: [0.5, 1.1], script: 'devanagari' },
  distant_phone: { name: 'distant_phone', wordDrop: 0.35, windowDrop: 0.15, spellNoise: 0.45, filler: 0.12, sustain: 0.3, wordSec: [0.6, 1.2], script: 'gurmukhi' },
};

export type PlanStep = { lineId: string } | { instrumentalSec: number; audience?: boolean };

export interface SimWindow { t0: number; t1: number; text: string }
export interface TruthSegment { t0: number; t1: number; lineId: string | null }
export interface SimClip {
  windows: SimWindow[];
  truth: TruthSegment[];
  durationSec: number;
  /** Recognised words with their end times, for real-time playback (Practice mode). */
  words: { t: number; text: string }[];
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const FILLERS = ['ਜੀ', 'ਹਾਂ', 'ਓ', 'ਵਾਹਿਗੁਰੂ', 'ਬੋਲੋ', 'ਸਾਧ ਸੰਗਤ'];
const ASPIRATE: Record<string, string> = { 'ਕ': 'ਖ', 'ਖ': 'ਕ', 'ਗ': 'ਘ', 'ਘ': 'ਗ', 'ਤ': 'ਥ', 'ਥ': 'ਤ', 'ਦ': 'ਧ', 'ਧ': 'ਦ', 'ਪ': 'ਫ', 'ਬ': 'ਭ', 'ਭ': 'ਬ', 'ਟ': 'ਤ', 'ਡ': 'ਦ' };
const VOWEL_SWAP: Record<string, string> = { 'ਿ': 'ੀ', 'ੀ': 'ਿ', 'ੁ': 'ੂ', 'ੂ': 'ੁ', 'ੇ': 'ੈ', 'ੈ': 'ੇ', 'ੋ': 'ੌ', 'ੌ': 'ੋ' };

function misspell(w: string, r: () => number): string {
  const cs = Array.from(w);
  const k = Math.floor(r() * 4);
  if (k === 0) return w.replace(/[ੁਿ]$/, ''); // ASR drops lagaan
  if (k === 1) return w.replace(/[ੰਂੱ]/g, ''); // nasal / addak lost
  const i = Math.floor(r() * cs.length);
  if (k === 2 && ASPIRATE[cs[i]]) cs[i] = ASPIRATE[cs[i]];
  else if (VOWEL_SWAP[cs[i]]) cs[i] = VOWEL_SWAP[cs[i]];
  return cs.join('');
}

function sustainWord(w: string): string {
  // A held final vowel, as a recogniser might spell it out.
  return /[ਾ]$/.test(w) ? w + 'ਆ' : /[ਿੀ]$/.test(w) ? w + 'ਈ' : w + 'ਏ';
}

export function simulate(corpus: Corpus, plan: PlanStep[], profile: Profile, seed: number): SimClip {
  const r = rng(seed);
  const sung: { t0: number; t1: number; text: string }[] = [];
  const truth: TruthSegment[] = [];
  let t = 0;
  for (const step of plan) {
    if ('instrumentalSec' in step) {
      const start = t;
      if (step.audience) sung.push({ t0: t + 1, t1: t + 2, text: 'ਵਾਹਿਗੁਰੂ' });
      t += step.instrumentalSec;
      truth.push({ t0: start, t1: t, lineId: null });
      continue;
    }
    const line = corpus.lineById.get(step.lineId);
    if (!line) throw new Error(`unknown line ${step.lineId}`);
    const start = t;
    for (const w of words(line.text)) {
      const sustained = r() < profile.sustain;
      const d = profile.wordSec[0] + r() * (profile.wordSec[1] - profile.wordSec[0]) + (sustained ? 1.2 : 0);
      if (r() >= profile.wordDrop) {
        let out = r() < profile.spellNoise ? misspell(w, r) : w;
        if (sustained) out = sustainWord(out);
        sung.push({ t0: t, t1: t + d, text: out });
      }
      t += d;
      if (r() < profile.filler) sung.push({ t0: t, t1: t + 0.3, text: FILLERS[Math.floor(r() * FILLERS.length)] });
    }
    t += 0.4;
    truth.push({ t0: start, t1: t, lineId: line.id });
  }
  const windows: SimWindow[] = [];
  const WINDOW = 5, HOP = 1.5;
  for (let end = HOP; end <= t + HOP; end += HOP) {
    const t0 = Math.max(0, end - WINDOW);
    const ws = sung.filter((s) => s.t1 > t0 && s.t1 <= end && r() >= profile.windowDrop).map((s) => s.text);
    let text = ws.join(' ');
    if (profile.script === 'devanagari') text = gurmukhiToDevanagari(text);
    windows.push({ t0: round(t0), t1: round(end), text });
  }
  const outWords = sung.map((s) => ({ t: round(s.t1), text: profile.script === 'devanagari' ? gurmukhiToDevanagari(s.text) : s.text }));
  return { windows, truth, durationSec: round(t), words: outWords };
}

/** Verses are runs of lines ending in a numbered ॥N॥ marker; rahao lines stand alone. */
export function structure(corpus: Corpus, shabadId: string) {
  const lines = corpus.shabadLines(shabadId).filter((l) => l.indexed);
  const rahao = lines.filter((l) => l.type === 3 || /ਰਹਾਉ/.test(l.text));
  const verses: Line[][] = [];
  let cur: Line[] = [];
  for (const l of lines) {
    if (rahao.includes(l)) { if (cur.length) verses.push(cur); cur = []; continue; }
    cur.push(l);
    if (/॥[੦-੯]+॥\s*$/.test(l.text)) { verses.push(cur); cur = []; }
  }
  if (cur.length) verses.push(cur);
  return { rahao, verses };
}

/**
 * A kirtan-like plan: start midway through a verse, return to the refrain between verses,
 * skip a verse, repeat lines, and include instrumental gaps.
 */
export function kirtanPlan(corpus: Corpus, shabadId: string, seed: number): PlanStep[] {
  const r = rng(seed);
  const { rahao, verses } = structure(corpus, shabadId);
  const refrain = rahao[0] ?? verses[0]?.[0];
  const plan: PlanStep[] = [{ instrumentalSec: 4 + Math.floor(r() * 4) }];
  const first = Math.min(verses.length - 1, Math.floor(r() * verses.length));
  const verseOrder = verses.map((_, i) => i).filter((i) => i >= first);
  if (verseOrder.length > 2 && r() < 0.6) verseOrder.splice(1, 1); // skip a verse
  verseOrder.forEach((vi, k) => {
    const v = verses[vi];
    const startAt = k === 0 ? Math.floor(r() * v.length) : 0; // start midway in the first verse
    for (const l of v.slice(startAt)) {
      plan.push({ lineId: l.id });
      if (r() < 0.4) plan.push({ lineId: l.id }); // repeated line
    }
    if (refrain) { plan.push({ lineId: refrain.id }); if (r() < 0.5) plan.push({ lineId: refrain.id }); }
    if (r() < 0.4) plan.push({ instrumentalSec: 5 + Math.floor(r() * 6), audience: r() < 0.3 });
  });
  return plan;
}

function round(x: number) {
  return Math.round(x * 100) / 100;
}
