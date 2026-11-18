// Practice mode: plays SYNTHETIC recogniser output for real shabads in real time, so the
// screens can be tried without live kirtan. It never touches the microphone.

import { simulate, structure, PROFILES, type Corpus, type PlanStep, type RecognitionAdapter } from '@shabad/core';

export type Scenario = 1 | 2 | 3 | 4;

function plan(corpus: Corpus, s: Scenario): PlanStep[] {
  if (s === 4) return [{ instrumentalSec: 12 }, { instrumentalSec: 12, audience: true }, { instrumentalSec: 20 }];
  if (s === 2) {
    // "ਮੇਰੇ ਮਨ ਹਰਿ ਹਰਿ ਨਾਮੁ ਧਿਆਇ ॥" is the rahao of two shabads (Ang 44 and Ang 47).
    const { rahao, verses } = structure(corpus, 'QNL');
    return [{ instrumentalSec: 3 }, { lineId: rahao[0].id }, { lineId: rahao[0].id }, { instrumentalSec: 4 }, { lineId: rahao[0].id }, ...verses[0].map((l) => ({ lineId: l.id })), { lineId: rahao[0].id }];
  }
  // Ang 96, ਮੇਰਾ ਮਨੁ ਲੋਚੈ ਗੁਰ ਦਰਸਨ ਤਾਈ.
  const { rahao, verses } = structure(corpus, 'MRB');
  if (s === 1) return [{ instrumentalSec: 3 }, ...verses[1].slice(1).map((l) => ({ lineId: l.id })), { lineId: rahao[1].id }, ...verses[2].map((l) => ({ lineId: l.id })), { lineId: rahao[2].id }];
  return [{ instrumentalSec: 3 }, ...verses[1].map((l) => ({ lineId: l.id })), { lineId: rahao[1].id }, { instrumentalSec: 5 }, { lineId: verses[0][0].id }, { lineId: rahao[0].id }, { lineId: rahao[0].id }];
}

export class PracticeAdapter implements RecognitionAdapter {
  readonly name = 'practice';
  private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(private corpus: Corpus, private scenario: Scenario) {}

  start({ onText }: Parameters<RecognitionAdapter['start']>[0]) {
    const clip = simulate(this.corpus, plan(this.corpus, this.scenario), PROFILES.clear_close, 7 + this.scenario);
    for (const w of clip.words) this.timers.push(setTimeout(() => onText(w.text, true), w.t * 1000));
  }

  stop() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

/** No microphone: text arrives only from the "type what you hear" box. */
export class TypedAdapter implements RecognitionAdapter {
  readonly name = 'typed';
  start() {}
  stop() {}
}
