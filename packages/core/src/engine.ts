import type { Corpus, Line } from './corpus';
import { search, type LineHit } from './matcher';
import { tokenize } from './normalize';
import type { AudioWindow, Candidate, EngineResponse } from './types';

/**
 * Thresholds are in IDF units (see matcher). They were set on the synthetic *tuning*
 * split only; see docs/EVALUATION.md. They are not validated on real kirtan audio.
 */
export const DEFAULT_PARAMS = {
  /** Minimum alignment score for a line to count as heard. */
  heardMin: 8,
  /** A line must match at least this many words. A single common word is weak evidence. */
  heardMinWords: 2,
  /** Lines scoring within this ratio of a hit count as ties when judging how specific it is. */
  tieRatio: 0.85,
  /** Other lines scoring within this ratio of the best are kept as sound-alike candidates. */
  soundAlikeRatio: 0.7,
  /** Auto-open needs this much support and this margin over the runner-up. */
  resolveMin: 10,
  resolveMargin: 5,
  /** Live tracking inside the selected shabad. */
  trackMin: 5,
  trackMargin: 2,
  /** Consecutive windows of strong evidence for a different shabad before an auto-opened shabad is replaced. */
  switchAfter: 3,
  /** Identification evidence older than this (seconds) is dropped. */
  evidenceTtl: 120,
};
export type EngineParams = typeof DEFAULT_PARAMS;

interface GroupEvidence {
  group: number;
  best: number;
  firstHeard: number;
  lastHeard: number;
  /** End time of the last window that contributed, used to merge overlapping windows. */
  lastT1: number;
  /** Non-overlapping hearings. Repeats are recorded but add no support. */
  hearings: number;
  /** This line was the best match of at least one window: its text is what was heard. */
  confirmed: boolean;
  /** Windows that contributed (most recent last), for overlap checks. */
  windows: { t0: number; t1: number }[];
}

type Mode =
  | { kind: 'identify' }
  | { kind: 'track'; shabadId: string; selectedBy: 'auto' | 'user'; currentLineIdx: number | null; paused: boolean; possible: number[]; offTrack: number };

export class RecognitionSession {
  private evidence = new Map<number, GroupEvidence>();
  private mode: Mode = { kind: 'identify' };
  private snapshot: Candidate[] = [];
  private freshSince = -Infinity;
  private lastSeq = -1;
  private lastT = 0;
  readonly params: EngineParams;

  constructor(readonly corpus: Corpus, readonly sessionId: string, params: Partial<EngineParams> = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
  }

  /** Process one window. Windows from another session or older than the last one are rejected. */
  process(w: AudioWindow): EngineResponse | null {
    if (w.sessionId !== this.sessionId || w.seq <= this.lastSeq) return null;
    this.lastSeq = w.seq;
    this.lastT = w.t1;
    const tokens = tokenize(w.text);
    const base = { sessionId: this.sessionId, seq: w.seq, t0: w.t0, t1: w.t1 };
    if (this.mode.kind === 'track') return this.track(tokens, base);
    return this.identify(tokens, base);
  }

  /** Explicit user choice. Preserved until the user changes it. */
  select(shabadId: string): EngineResponse {
    if (!this.corpus.shabads.has(shabadId)) throw new Error(`unknown shabad ${shabadId}`);
    const heard = this.recentLineIn(shabadId);
    this.mode = { kind: 'track', shabadId, selectedBy: 'user', currentLineIdx: heard, paused: heard === null, possible: [], offTrack: 0 };
    return this.trackResponse(this.base('user selected shabad'), 'user selected shabad');
  }

  /** Return to all matches. Auto-resolution then needs evidence heard after this moment. */
  clearSelection(): EngineResponse {
    this.mode = { kind: 'identify' };
    this.freshSince = this.lastT;
    const candidates = this.snapshot.length ? this.snapshot : this.candidates();
    if (!candidates.length) return { ...this.base('returned to all matches; none retained'), status: 'listening' };
    const top = this.topGroup();
    const line = top !== null ? this.corpus.lines[this.corpus.groups[top][0]] : this.corpus.lineById.get(candidates[0].matchedLineIds[0])!;
    return { ...this.base('returned to all matches'), status: 'ambiguous', heard: { lineId: line.id, text: line.text }, candidates };
  }

  get state() {
    return this.mode;
  }

  // ---------------------------------------------------------------- identification

  private identify(tokens: ReturnType<typeof tokenize>, base: Omit<EngineResponse, 'status' | 'reason'>): EngineResponse {
    this.prune(base.t1);
    const p = this.params;
    const hits = tokens.length ? search(this.corpus, tokens) : [];
    const strong = this.strongHits(hits);
    if (strong.length) this.record(strong, hits, base.t0, base.t1);

    const candidates = this.candidates();
    if (!candidates.length) {
      if (!tokens.length) return { ...base, status: 'listening', reason: 'no speech in window' };
      return { ...base, status: tokens.length >= 3 ? 'no_match' : 'listening', reason: `no line reached heardMin (best ${hits[0]?.score.toFixed(1) ?? '0'})` };
    }

    const [a, b] = candidates;
    const margin = a.support - (b?.support ?? 0);
    const decisive = this.freshDistinguishingGroup(a.shabadId, b?.shabadId);
    if (a.support >= p.resolveMin && margin >= p.resolveMargin && decisive !== null) {
      const lineIdx = this.lineOfGroupIn(decisive, a.shabadId, null);
      this.snapshot = candidates;
      this.mode = { kind: 'track', shabadId: a.shabadId, selectedBy: 'auto', currentLineIdx: lineIdx, paused: lineIdx === null, possible: [], offTrack: 0 };
      return this.trackResponse(base, `resolved: support ${a.support.toFixed(1)}, margin ${margin.toFixed(1)} over ${b ? b.shabadId : 'none'}`);
    }

    const top = this.topGroup()!;
    const line = this.corpus.lines[this.corpus.groups[top][0]];
    const why = !strong.length ? 'no new evidence; keeping list'
      : decisive === null && b ? 'no fresh distinguishing line yet'
      : `support ${a.support.toFixed(1)}, margin ${margin.toFixed(1)}`;
    this.snapshot = candidates;
    return { ...base, status: 'ambiguous', heard: { lineId: line.id, text: line.text }, candidates, reason: why };
  }

  private strongHits(hits: LineHit[]): LineHit[] {
    const p = this.params;
    const ok = hits.filter((h) => h.score >= p.heardMin && h.matchedCount >= p.heardMinWords);
    if (!ok.length) return [];
    const floor = ok[0].score * p.soundAlikeRatio;
    return ok.filter((h) => h.score >= floor);
  }

  /** Overlapping windows hear the same audio twice: merge instead of adding. */
  private record(hits: LineHit[], all: LineHit[], t0: number, t1: number) {
    // One window is one stretch of audio: it can be evidence for at most one line per
    // shabad. Without this, a short phrase that opens several lines of one shabad would
    // count several times over.
    const bestPerShabad = new Map<string, LineHit>();
    for (const h of hits) {
      for (const sid of this.corpus.groupShabads(h.line.group)) {
        const cur = bestPerShabad.get(sid);
        if (!cur || h.score > cur.score) bestPerShabad.set(sid, h);
      }
    }
    // A phrase that many different lines match equally well says little about which one was
    // sung (a common phrase is weak evidence, like a common word). Evidence is discounted by
    // the number of distinct line texts that tie with it in this window.
    const specificity = (h: LineHit) => {
      const ties = new Set(all.filter((x) => x.score >= h.score * this.params.tieRatio).map((x) => x.line.group)).size;
      return 1 / (1 + Math.log2(Math.max(1, ties)));
    };
    const bestPerGroup = new Map<number, number>();
    for (const h of bestPerShabad.values()) bestPerGroup.set(h.line.group, Math.max(bestPerGroup.get(h.line.group) ?? 0, h.score * specificity(h)));

    // Overlapping audio heard more completely supersedes a weak earlier reading of it.
    const top = hits[0].score;
    for (const [g, e] of this.evidence) {
      if (bestPerGroup.has(g) || e.hearings > 1 || e.lastT1 <= t0) continue;
      if (e.best < top * this.params.soundAlikeRatio) this.evidence.delete(g);
    }

    for (const [group, score] of bestPerGroup) {
      const e = this.evidence.get(group);
      if (!e) {
        this.evidence.set(group, { group, best: score, firstHeard: t0, lastHeard: t1, lastT1: t1, hearings: 1, confirmed: group === hits[0].line.group, windows: [{ t0, t1 }] });
        continue;
      }
      if (t0 >= e.lastT1) e.hearings++; // a repeat: no new support
      e.best = Math.max(e.best, score);
      if (group === hits[0].line.group) e.confirmed = true;
      e.windows.push({ t0, t1 });
      if (e.windows.length > 24) e.windows.shift();
      e.lastHeard = t1;
      e.lastT1 = t1;
    }
  }

  private prune(now: number) {
    for (const [g, e] of this.evidence) if (now - e.lastHeard > this.params.evidenceTtl) this.evidence.delete(g);
  }

  private topGroup(): number | null {
    let best: GroupEvidence | null = null;
    for (const e of this.evidence.values()) if (!best || e.best > best.best || (e.best === best.best && e.lastHeard > best.lastHeard)) best = e;
    return best?.group ?? null;
  }

  /**
   * Support = sum over distinct heard lines (groups). Repeats of a line add nothing, and a
   * second line only counts if some of its audio does not overlap the audio of lines already
   * counted for that shabad: overlapping windows re-hear the same sound, so one phrase cannot
   * become evidence for two different lines of one shabad.
   */
  private candidates(): Candidate[] {
    const byShabad = new Map<string, GroupEvidence[]>();
    for (const e of this.evidence.values()) {
      for (const sid of this.corpus.groupShabads(e.group)) {
        const list = byShabad.get(sid) ?? [];
        list.push(e);
        byShabad.set(sid, list);
      }
    }
    const overlaps = (a: { t0: number; t1: number }, b: { t0: number; t1: number }) => a.t0 < b.t1 && b.t0 < a.t1;
    const rows: { shabadId: string; support: number; exact: boolean; lines: string[] }[] = [];
    for (const [sid, list] of byShabad) {
      list.sort((x, y) => y.best - x.best);
      const accepted: GroupEvidence[] = [];
      for (const e of list) {
        if (accepted.length && !e.windows.some((w) => accepted.every((a) => a.windows.every((aw) => !overlaps(w, aw))))) continue;
        accepted.push(e);
      }
      const lines = list.flatMap((e) => this.corpus.groups[e.group].map((i) => this.corpus.lines[i]).filter((l) => l.shabadId === sid).map((l) => l.id));
      rows.push({ shabadId: sid, support: accepted.reduce((a, e) => a + e.best, 0), exact: list.some((e) => e.confirmed), lines });
    }
    const ids = rows.map((r) => r.shabadId);
    return rows
      .map((r): Candidate => ({
        shabadId: r.shabadId,
        match: r.exact ? 'exact' : 'sound_alike',
        matchedLineIds: r.lines,
        distinguishingLine: this.distinguishingLine(r.shabadId, ids),
        source: this.corpus.sourceRef(r.shabadId),
        support: round(r.support),
      }))
      .sort((x, y) => y.support - x.support || (x.match === 'exact' ? -1 : 1) - (y.match === 'exact' ? -1 : 1) || this.corpus.shabads.get(x.shabadId)!.order - this.corpus.shabads.get(y.shabadId)!.order);
  }

  /** A group heard since `freshSince` that contains shabad a but not b. */
  private freshDistinguishingGroup(a: string, b: string | undefined): number | null {
    let best: GroupEvidence | null = null;
    for (const e of this.evidence.values()) {
      if (e.lastHeard <= this.freshSince) continue;
      const shabads = this.corpus.groupShabads(e.group);
      if (!shabads.includes(a) || (b && shabads.includes(b))) continue;
      if (!best || e.lastHeard > best.lastHeard) best = e;
    }
    return best?.group ?? null;
  }

  private distinguishingLine(shabadId: string, others: string[]) {
    const lines = this.corpus.shabadLines(shabadId).filter((l) => l.indexed);
    const unique = (l: Line) => this.corpus.groupShabads(l.group).every((s) => s === shabadId || !others.includes(s));
    const pick = lines.find((l) => l.type === 3 && unique(l)) ?? lines.find(unique) ?? lines[0] ?? this.corpus.shabadLines(shabadId)[0];
    return { lineId: pick.id, text: pick.text };
  }

  private lineOfGroupIn(group: number, shabadId: string, near: number | null): number | null {
    const inShabad = this.corpus.groups[group].filter((i) => this.corpus.lines[i].shabadId === shabadId);
    if (inShabad.length === 1) return inShabad[0];
    if (!inShabad.length) return null;
    return this.byOrderPrior(inShabad, near);
  }

  /** Identical text at several places in one shabad: choose only if one is the next line from `near`. */
  private byOrderPrior(options: number[], near: number | null): number | null {
    if (near === null) return null;
    const nearPos = this.corpus.lines[near].pos;
    const next = options.filter((i) => { const d = this.corpus.lines[i].pos - nearPos; return d >= 0 && d <= 1; });
    return next.length === 1 ? next[0] : null;
  }

  private recentLineIn(shabadId: string): number | null {
    let best: GroupEvidence | null = null;
    for (const e of this.evidence.values()) {
      if (!this.corpus.groupShabads(e.group).includes(shabadId)) continue;
      if (!best || e.lastHeard > best.lastHeard) best = e;
    }
    return best ? this.lineOfGroupIn(best.group, shabadId, null) : null;
  }

  // ---------------------------------------------------------------- live tracking

  private track(tokens: ReturnType<typeof tokenize>, base: Omit<EngineResponse, 'status' | 'reason'>): EngineResponse {
    const m = this.mode as Extract<Mode, { kind: 'track' }>;
    const p = this.params;
    if (!tokens.length) return this.trackResponse(base, 'no speech; holding position');

    const within = this.corpus.shabads.get(m.shabadId)!.lines.filter((i) => this.corpus.lines[i].indexed);
    const hits = search(this.corpus, tokens, { within })
      // The line sung now is the one aligned with the end of the window.
      .map((h) => ({ h, eff: h.score * (h.queryEnd >= tokens.length - 3 ? 1 : 0.75) }))
      .sort((x, y) => y.eff - x.eff);
    const best = hits[0];

    if (!best || best.eff < p.trackMin || best.h.matchedCount < p.heardMinWords) {
      if (m.selectedBy === 'auto' && tokens.length >= 3) {
        const switched = this.checkSwitch(tokens, base);
        if (switched) return switched;
      }
      return this.trackResponse(base, `no line reached trackMin (best ${best?.eff.toFixed(1) ?? '0'}); holding position`);
    }
    m.offTrack = 0;

    const bestGroup = best.h.line.group;
    const rival = hits.find((x) => x.h.line.group !== bestGroup);
    const dupes = within.filter((i) => this.corpus.lines[i].group === bestGroup);

    if (dupes.length > 1) {
      const chosen = this.byOrderPrior(dupes, m.currentLineIdx);
      if (chosen === null) return this.pause(m, dupes, base, 'same text at several places; pausing');
      return this.advance(m, chosen, base, 'repeated text resolved by order');
    }
    if (rival && rival.eff >= p.trackMin && best.eff - rival.eff < p.trackMargin) {
      return this.pause(m, [best.h.line.idx, rival.h.line.idx], base, `two lines plausible (${best.eff.toFixed(1)} vs ${rival.eff.toFixed(1)}); pausing`);
    }
    return this.advance(m, best.h.line.idx, base, `line score ${best.eff.toFixed(1)}`);
  }

  private checkSwitch(tokens: ReturnType<typeof tokenize>, base: Omit<EngineResponse, 'status' | 'reason'>): EngineResponse | null {
    const m = this.mode as Extract<Mode, { kind: 'track' }>;
    const strong = this.strongHits(search(this.corpus, tokens)).filter((h) => h.score >= this.params.resolveMin && !this.corpus.groupShabads(h.line.group).includes(m.shabadId));
    if (!strong.length) { m.offTrack = 0; return null; }
    m.offTrack++;
    if (m.offTrack < this.params.switchAfter) return null;
    // Kirtan has moved on to another shabad: start identifying again from this evidence.
    this.evidence.clear();
    this.snapshot = [];
    this.mode = { kind: 'identify' };
    this.freshSince = -Infinity;
    return this.identify(tokens, base);
  }

  private advance(m: Extract<Mode, { kind: 'track' }>, idx: number, base: Omit<EngineResponse, 'status' | 'reason'>, why: string) {
    m.currentLineIdx = idx;
    m.paused = false;
    m.possible = [];
    return this.trackResponse(base, why);
  }

  private pause(m: Extract<Mode, { kind: 'track' }>, possible: number[], base: Omit<EngineResponse, 'status' | 'reason'>, why: string) {
    m.paused = true;
    m.possible = possible;
    return this.trackResponse(base, why);
  }

  private trackResponse(base: Omit<EngineResponse, 'status' | 'reason'>, reason: string): EngineResponse {
    const m = this.mode as Extract<Mode, { kind: 'track' }>;
    const lastLineId = m.currentLineIdx === null ? null : this.corpus.lines[m.currentLineIdx].id;
    const source = this.corpus.sourceRef(m.shabadId);
    const candidates = this.snapshot;
    if (m.paused && m.possible.length) {
      return { ...base, status: 'uncertain_line', shabadId: m.shabadId, selectedBy: m.selectedBy, lastLineId, possibleLineIds: m.possible.map((i) => this.corpus.lines[i].id), lineStatus: 'paused', source, candidates, reason };
    }
    const matched = new Set<string>();
    for (const e of this.evidence.values()) for (const i of this.corpus.groups[e.group]) if (this.corpus.lines[i].shabadId === m.shabadId) matched.add(this.corpus.lines[i].id);
    if (lastLineId) matched.add(lastLineId);
    return { ...base, status: 'resolved', shabadId: m.shabadId, selectedBy: m.selectedBy, currentLineId: lastLineId, lineStatus: m.paused || lastLineId === null ? 'paused' : 'live', matchedLineIds: [...matched], source, candidates, reason };
  }

  private base(reason: string) {
    return { sessionId: this.sessionId, seq: this.lastSeq, t0: this.lastT, t1: this.lastT, reason };
  }
}

function round(x: number) {
  return Math.round(x * 10) / 10;
}
