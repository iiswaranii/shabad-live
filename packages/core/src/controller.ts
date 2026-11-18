// Platform-neutral listening controller used by the app. It owns the capture lifecycle,
// turns a recogniser's running transcript into short overlapping windows, and makes sure
// responses from cancelled requests or earlier sessions are never applied.

import type { Corpus } from './corpus';
import { RecognitionSession } from './engine';
import type { AudioWindow, EngineResponse } from './types';

/** Replaceable recogniser: Web Speech, a native recogniser, a server model, or a test script. */
export interface RecognitionAdapter {
  readonly name: string;
  /** Start capture. `onText` receives the full text recognised so far in the current utterance. */
  start(handlers: { onText: (text: string, isFinal: boolean) => void; onError: (message: string) => void }): void | Promise<void>;
  /** Stop capture and release the microphone. Must be idempotent. */
  stop(): void;
}

/** Where windows are matched: in-process, or the Node API. */
export interface EngineClient {
  open(sessionId: string): Promise<void>;
  send(w: AudioWindow, signal: AbortSignal): Promise<EngineResponse | null>;
  select(sessionId: string, shabadId: string): Promise<EngineResponse>;
  clear(sessionId: string): Promise<EngineResponse>;
  close(sessionId: string): void;
}

export class LocalEngineClient implements EngineClient {
  private sessions = new Map<string, RecognitionSession>();
  constructor(private corpus: Corpus) {}
  async open(id: string) { this.sessions.set(id, new RecognitionSession(this.corpus, id)); }
  async send(w: AudioWindow) { return this.sessions.get(w.sessionId)?.process(w) ?? null; }
  async select(id: string, shabadId: string) { return this.sessions.get(id)!.select(shabadId); }
  async clear(id: string) { return this.sessions.get(id)!.clearSelection(); }
  close(id: string) { this.sessions.delete(id); }
}

export interface ControllerState {
  phase: 'idle' | 'listening' | 'stopped' | 'error';
  sessionId: string | null;
  response: EngineResponse | null;
  /** Last recognised text, for an optional on-screen hint. */
  heardText: string;
  error: string | null;
  /** Reader position the user scrolled to; kept across stop. */
  readingLineId: string | null;
  /** True when the user has scrolled away from the live line. */
  detached: boolean;
}

export interface ControllerOptions {
  windowSec?: number;
  hopSec?: number;
  maxWords?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (h: unknown) => void;
  newId?: () => string;
}

export class ListenController {
  private state: ControllerState = { phase: 'idle', sessionId: null, response: null, heardText: '', error: null, readingLineId: null, detached: false };
  private listeners = new Set<(s: ControllerState) => void>();
  private words: { w: string; t: number }[] = [];
  private finalCount = 0;
  private timer: unknown = null;
  private seq = 0;
  private startedAt = 0;
  private inflight: AbortController | null = null;
  private lastApplied = -1;
  private o: Required<ControllerOptions>;

  constructor(private adapter: RecognitionAdapter, private engine: EngineClient, opts: ControllerOptions = {}) {
    this.o = {
      windowSec: 6, hopSec: 1.5, maxWords: 14,
      now: () => Date.now() / 1000,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      newId: () => Math.random().toString(36).slice(2, 10),
      ...opts,
    };
  }

  get snapshot() { return this.state; }
  get adapterName() { return this.adapter.name; }

  subscribe(fn: (s: ControllerState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  async start() {
    if (this.state.phase === 'listening') return;
    // A new session: anything still in flight from an earlier one is cancelled and ignored.
    this.cancelInflight();
    if (this.state.sessionId) this.engine.close(this.state.sessionId);
    const sessionId = this.o.newId();
    this.seq = 0; this.lastApplied = -1; this.words = []; this.finalCount = 0;
    this.startedAt = this.o.now();
    this.set({ phase: 'listening', sessionId, response: null, heardText: '', error: null, detached: false, readingLineId: null });
    // The recogniser is started synchronously, before any await: mobile Safari only lets
    // speech recognition start inside the tap that asked for it.
    let started: void | Promise<void>;
    try {
      started = this.adapter.start({
        onText: (text, isFinal) => this.onText(sessionId, text, isFinal),
        onError: (message) => { if (this.state.sessionId === sessionId) this.set({ error: message }); },
      });
    } catch (e) {
      this.adapter.stop();
      this.set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    try {
      await this.engine.open(sessionId);
      await started;
    } catch (e) {
      this.adapter.stop();
      this.set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    this.timer = this.o.setInterval(() => this.tick(sessionId), this.o.hopSec * 1000);
  }

  /** Stop capture. The open shabad, selection and reading position stay on screen. */
  stop() {
    this.adapter.stop();
    if (this.timer !== null) { this.o.clearInterval(this.timer); this.timer = null; }
    this.cancelInflight();
    if (this.state.phase === 'listening') this.set({ phase: 'stopped' });
  }

  async select(shabadId: string) {
    const id = this.state.sessionId;
    if (!id) return;
    const r = await this.engine.select(id, shabadId);
    if (id === this.state.sessionId) this.set({ response: r, detached: false });
  }

  async clearSelection() {
    const id = this.state.sessionId;
    if (!id) return;
    const r = await this.engine.clear(id);
    if (id === this.state.sessionId) this.set({ response: r });
  }

  /** Clear a recoverable error after the adapter has been resumed. */
  clearError() { this.set({ error: null }); }

  setReadingPosition(lineId: string | null, detached: boolean) {
    this.set({ readingLineId: lineId, detached });
  }

  returnToLive() { this.set({ detached: false }); }

  /** Feed text directly (manual "type what you hear" testing). */
  injectText(text: string) {
    if (this.state.phase !== 'listening' || !this.state.sessionId) return;
    this.onText(this.state.sessionId, text, true);
    this.tick(this.state.sessionId);
  }

  private onText(sessionId: string, text: string, isFinal: boolean) {
    if (sessionId !== this.state.sessionId || this.state.phase !== 'listening') return;
    const now = this.o.now();
    const incoming = text.trim().split(/\s+/).filter(Boolean);
    // Words before finalCount are settled; the rest is the current (interim) utterance.
    const settled = this.words.slice(0, this.finalCount);
    const interim = this.words.slice(this.finalCount);
    const next = incoming.map((w, i) => ({ w, t: interim[i]?.w === w ? interim[i].t : now }));
    this.words = [...settled, ...next].slice(-200);
    if (isFinal) this.finalCount = this.words.length;
    else this.finalCount = Math.min(this.finalCount, this.words.length);
    this.set({ heardText: incoming.slice(-8).join(' ') });
  }

  private tick(sessionId: string) {
    if (sessionId !== this.state.sessionId || this.state.phase !== 'listening') return;
    const now = this.o.now();
    const recent = this.words.filter((x) => x.t >= now - this.o.windowSec).slice(-this.o.maxWords);
    const w: AudioWindow = {
      sessionId, seq: ++this.seq,
      t0: Math.max(0, now - this.o.windowSec - this.startedAt), t1: now - this.startedAt,
      text: recent.map((x) => x.w).join(' '),
    };
    // Only the newest request matters; an older one still running is cancelled.
    this.cancelInflight();
    const ac = new AbortController();
    this.inflight = ac;
    this.engine.send(w, ac.signal).then((r) => {
      if (ac.signal.aborted || !r) return;
      this.apply(r);
    }).catch(() => { /* aborted or network error: the next window retries */ });
  }

  /** Apply a response only if it belongs to the current session and is newer than the last one. */
  apply(r: EngineResponse) {
    if (r.sessionId !== this.state.sessionId || r.seq <= this.lastApplied) return false;
    this.lastApplied = r.seq;
    this.set({ response: r });
    return true;
  }

  private cancelInflight() {
    this.inflight?.abort();
    this.inflight = null;
  }
}
