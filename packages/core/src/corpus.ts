import { tokenize, type Token } from './normalize';

/** On-disk pack produced by tools/importer. */
export interface CorpusPack {
  format: 'shabad-live-corpus@1';
  provenance: Record<string, string>;
  source: { id: number; nameEn: string; namePa: string; pageNameEn: string; pageNamePa: string; length: number };
  writers: Record<string, { en: string; pa: string }>;
  sections: Record<string, { en: string; pa: string }>;
  lineTypes: Record<string, string>;
  /** Lines in original order: [lineId, page, typeId, gurmukhi]. */
  shabads: { id: string; order: number; writer: number; section: number; lines: [string, number, number, string][] }[];
}

export const LINE_TYPE = { MANGLACHARAN: 1, SIRLEKH: 2, RAHAO: 3, PANKTI: 4 } as const;

export interface Line {
  idx: number;
  id: string;
  shabadId: string;
  /** Position within its shabad, 0-based, original order. */
  pos: number;
  page: number;
  type: number;
  /** Original Unicode text, for display only. */
  text: string;
  /** Search tokens derived from `text`; each maps back to this line. */
  tokens: Token[];
  /** Per-token evidence weights (IDF), parallel to `tokens`. */
  weights: number[];
  weight: number;
  /** Lines with the same normalised text share a group (shared pangtis). -1 = not indexed. */
  group: number;
  indexed: boolean;
}

export interface Shabad {
  id: string;
  sourceId: number;
  order: number;
  writer: number;
  section: number;
  firstPage: number;
  lines: number[];
}

export interface SourceInfo {
  id: number;
  nameEn: string;
  namePa: string;
  pageNameEn: string;
  pageNamePa: string;
}

// Headings (Sirlekh) are not sung as pangtis, and Manglacharan lines open hundreds of
// shabads, so neither can identify a shabad. They are displayed but not indexed.
// REVIEW: confirm with a kirtan-experienced reviewer.
const INDEXED_TYPES = new Set<number>([LINE_TYPE.RAHAO, LINE_TYPE.PANKTI]);

const MAX_UNIGRAM_DF = 400;

export class Corpus {
  readonly lines: Line[] = [];
  readonly shabads = new Map<string, Shabad>();
  readonly lineById = new Map<string, Line>();
  readonly sources = new Map<number, SourceInfo>();
  readonly writers = new Map<number, { en: string; pa: string }>();
  readonly sections = new Map<number, { en: string; pa: string }>();
  readonly provenance: Record<string, string>[] = [];
  /** group id -> line indices with identical normalised text. */
  readonly groups: number[][] = [];

  private df = new Map<string, number>();
  private indexedCount = 0;
  /** Bigram and skip-bigram keys -> line indices. */
  readonly postings = new Map<string, number[]>();
  /** Rare single tokens -> line indices. */
  readonly unigramPostings = new Map<string, number[]>();

  static fromPacks(packs: CorpusPack[]): Corpus {
    const c = new Corpus();
    for (const p of packs) c.addPack(p);
    c.buildIndex();
    return c;
  }

  private addPack(p: CorpusPack) {
    if (p.format !== 'shabad-live-corpus@1') throw new Error(`unknown corpus format ${p.format}`);
    this.provenance.push(p.provenance);
    this.sources.set(p.source.id, p.source);
    for (const [id, w] of Object.entries(p.writers)) this.writers.set(Number(id), w);
    for (const [id, s] of Object.entries(p.sections)) this.sections.set(Number(id), s);
    for (const s of p.shabads) {
      if (this.shabads.has(s.id)) throw new Error(`duplicate shabad id ${s.id}`);
      const sh: Shabad = { id: s.id, sourceId: p.source.id, order: s.order, writer: s.writer, section: s.section, firstPage: s.lines[0]?.[1] ?? 0, lines: [] };
      s.lines.forEach(([id, page, type, text], pos) => {
        const indexed = INDEXED_TYPES.has(type);
        const line: Line = {
          idx: this.lines.length, id, shabadId: s.id, pos, page, type, text,
          tokens: indexed ? tokenize(text) : [], weights: [], weight: 0, group: -1, indexed,
        };
        if (line.tokens.length === 0) line.indexed = false;
        if (this.lineById.has(id)) throw new Error(`duplicate line id ${id}`);
        this.lineById.set(id, line);
        this.lines.push(line);
        sh.lines.push(line.idx);
      });
      this.shabads.set(s.id, sh);
    }
  }

  idf(skel: string): number {
    const df = this.df.get(skel) ?? 0;
    return Math.min(10, Math.max(0.5, Math.log((this.indexedCount + 1) / (df + 0.5))));
  }

  private buildIndex() {
    const groupByKey = new Map<string, number>();
    for (const l of this.lines) {
      if (!l.indexed) continue;
      this.indexedCount++;
      for (const s of new Set(l.tokens.map((t) => t.skel))) this.df.set(s, (this.df.get(s) ?? 0) + 1);
      const key = l.tokens.map((t) => t.loose ?? t.skel).join(' ');
      let g = groupByKey.get(key);
      if (g === undefined) { g = this.groups.length; groupByKey.set(key, g); this.groups.push([]); }
      this.groups[g].push(l.idx);
      l.group = g;
    }
    for (const l of this.lines) {
      if (!l.indexed) continue;
      l.weights = l.tokens.map((t) => this.idf(t.skel));
      l.weight = l.weights.reduce((a, b) => a + b, 0);
      const keys = new Set<string>();
      const sk = l.tokens.map((t) => t.skel);
      for (let j = 0; j < sk.length; j++) {
        if (j + 1 < sk.length) keys.add(`${sk[j]} ${sk[j + 1]}`);
        if (j + 2 < sk.length) keys.add(`${sk[j]} ${sk[j + 2]}`); // tolerates a missed word
      }
      for (const k of keys) push(this.postings, k, l.idx);
      for (const s of new Set(sk)) if ((this.df.get(s) ?? 0) <= MAX_UNIGRAM_DF) push(this.unigramPostings, s, l.idx);
    }
  }

  shabadLines(shabadId: string): Line[] {
    const s = this.shabads.get(shabadId);
    return s ? s.lines.map((i) => this.lines[i]) : [];
  }

  /** Shabad ids whose text contains this line's normalised text. */
  groupShabads(group: number): string[] {
    return [...new Set(this.groups[group].map((i) => this.lines[i].shabadId))];
  }

  sourceRef(shabadId: string) {
    const s = this.shabads.get(shabadId)!;
    const src = this.sources.get(s.sourceId)!;
    return { sourceId: src.id, sourceEn: src.nameEn, sourcePa: src.namePa, pageNameEn: src.pageNameEn, pageNamePa: src.pageNamePa, page: s.firstPage };
  }

  stats() {
    return { shabads: this.shabads.size, lines: this.lines.length, indexedLines: this.indexedCount, sharedGroups: this.groups.filter((g) => new Set(g.map((i) => this.lines[i].shabadId)).size > 1).length };
  }
}

function push(m: Map<string, number[]>, k: string, v: number) {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
}
