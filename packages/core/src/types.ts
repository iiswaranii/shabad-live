// Response contract shared by the app, the Node API and the CLI.

/** One short, overlapping slice of recognised audio. Times are seconds since session start. */
export interface AudioWindow {
  sessionId: string;
  seq: number;
  t0: number;
  t1: number;
  /** Recogniser output for this window (Gurmukhi, Devanagari or romanised). Empty = no speech. */
  text: string;
}

export interface SourceRef {
  sourceId: number;
  sourceEn: string;
  sourcePa: string;
  pageNameEn: string;
  pageNamePa: string;
  /** Page (Ang for Sri Guru Granth Sahib Ji) where the shabad begins. */
  page: number;
}

export interface Candidate {
  shabadId: string;
  /** 'exact': the heard line's text is in this shabad. 'sound_alike': a similar-sounding, different line. */
  match: 'exact' | 'sound_alike';
  matchedLineIds: string[];
  /** A line that tells this shabad apart from the other candidates. */
  distinguishingLine: { lineId: string; text: string };
  source: SourceRef;
  support: number;
}

interface Base {
  sessionId: string;
  seq: number;
  t0: number;
  t1: number;
  /** Human-readable explanation of the decision, for logs and evaluation. */
  reason: string;
}

export type EngineResponse =
  | (Base & { status: 'listening' })
  | (Base & { status: 'no_match' })
  | (Base & {
      status: 'ambiguous';
      heard: { lineId: string; text: string };
      candidates: Candidate[];
    })
  | (Base & {
      status: 'resolved';
      shabadId: string;
      selectedBy: 'auto' | 'user';
      /** null until a line has been heard with enough confidence. */
      currentLineId: string | null;
      /** 'paused': the indicator is not asserting a live position. */
      lineStatus: 'live' | 'paused';
      matchedLineIds: string[];
      source: SourceRef;
      /** Candidates retained for "return to all matches". */
      candidates: Candidate[];
    })
  | (Base & {
      status: 'uncertain_line';
      shabadId: string;
      selectedBy: 'auto' | 'user';
      lastLineId: string | null;
      possibleLineIds: string[];
      lineStatus: 'paused';
      source: SourceRef;
      candidates: Candidate[];
    });

export type EngineStatus = EngineResponse['status'];
