import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Corpus, RecognitionSession, words, type EngineResponse } from '../src/index';

let cached: Corpus | null = null;
/** The full Sri Guru Granth Sahib Ji pack: tests search the entire corpus, not a subset. */
export function sggs(): Corpus {
  if (!cached) cached = Corpus.fromPacks([JSON.parse(readFileSync(join(__dirname, '../../../corpus/sri-guru-granth-sahib-ji.json'), 'utf8'))]);
  return cached;
}

/**
 * Feeds one sung line as overlapping windows, the way a recogniser would emit it: word-final
 * lagaan dropped (as modern Punjabi ASR writes), a sliding 6-word window advancing 2 words.
 */
export class Singer {
  t = 0;
  seq = 0;
  constructor(readonly s: RecognitionSession) {}

  line(lineId: string, opts: { drop?: number[] } = {}): EngineResponse[] {
    const line = this.s.corpus.lineById.get(lineId)!;
    const ws = words(line.text).map((w) => w.replace(/[ੁਿ]$/, '')).filter((_, i) => !opts.drop?.includes(i));
    const out: EngineResponse[] = [];
    for (let k = Math.min(2, ws.length); ; k = Math.min(ws.length, k + 2)) {
      out.push(this.window(ws.slice(Math.max(0, k - 6), k).join(' ')));
      if (k >= ws.length) break;
    }
    return out;
  }

  window(text: string): EngineResponse {
    this.t += 1.5;
    return this.s.process({ sessionId: this.s.sessionId, seq: ++this.seq, t0: Math.max(0, this.t - 5), t1: this.t, text })!;
  }

  silence(n: number): EngineResponse[] {
    return Array.from({ length: n }, () => this.window(''));
  }
}

export const last = <T>(a: T[]) => a[a.length - 1];
