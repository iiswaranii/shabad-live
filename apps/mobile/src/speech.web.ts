// Web Speech API recogniser (Chrome on Android, Safari on iPhone).
// The browser's speech service may process audio on its own servers; the consent screen
// says so before capture. Nothing here records or stores audio.
//
// Mobile Safari rules this adapter is written around:
//  - start() must run inside the user's tap (the controller calls it synchronously);
//  - recognition ends by itself after pauses, and a restart that is not inside a tap can be
//    refused with `not-allowed`. That is reported as `needs_tap`, not as a permission problem;
//  - `service-not-allowed` means the speech service is off or blocked (Dictation disabled,
//    Screen Time, Home Screen web app), not the microphone permission.

import type { RecognitionAdapter } from '@shabad/core';
import { levelBus } from './level';

type SR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  onstart: (() => void) | null; onaudiostart: (() => void) | null; onsoundstart: (() => void) | null; onspeechstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function ctor(): (new () => SR) | null {
  const w = globalThis as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupport = (): 'available' | 'unavailable' => (ctor() ? 'available' : 'unavailable');

export const isIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isStandalone = () =>
  typeof window !== 'undefined' && (((navigator as any).standalone === true) || window.matchMedia?.('(display-mode: standalone)').matches);

export class SpeechAdapter implements RecognitionAdapter {
  readonly name = 'web-speech';
  private rec: SR | null = null;
  private active = false;
  private everStarted = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private quickEnds = 0;
  private startedAt = 0;
  private handlers: Parameters<RecognitionAdapter['start']>[0] | null = null;
  /** Called once audio capture is running (the sound meter may attach then). */
  onAudioStart: (() => void) | null = null;

  constructor(private lang: string) {}

  start(handlers: Parameters<RecognitionAdapter['start']>[0]) {
    if (!ctor()) throw new Error('speech_unavailable');
    this.handlers = handlers;
    this.active = true;
    this.everStarted = false;
    this.run(); // synchronous: still inside the tap
  }

  /** Continue after `needs_tap`. Must be called from a tap handler. */
  resume() {
    if (!this.handlers) return;
    this.active = true;
    this.quickEnds = 0;
    this.run();
  }

  private run() {
    const C = ctor();
    if (!C || !this.active || !this.handlers) return;
    const { onText, onError } = this.handlers;
    const r = new C();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    const markStarted = () => { this.everStarted = true; };
    r.onstart = markStarted;
    r.onaudiostart = () => { markStarted(); this.onAudioStart?.(); };
    r.onsoundstart = () => levelBus.pulse(0.35);
    r.onspeechstart = () => levelBus.pulse(0.5);
    r.onresult = (e: any) => {
      markStarted();
      this.quickEnds = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) onText(text, true);
        else interim += ' ' + text;
      }
      if (interim.trim()) onText(interim, false);
      levelBus.pulse(0.6);
    };
    r.onerror = (e: any) => {
      const code: string = e?.error ?? 'unknown';
      if (code === 'no-speech' || code === 'aborted') return; // the session ends and restarts below
      if (code === 'not-allowed') {
        this.active = false;
        // Allowed before, refused now: Safari wants a fresh tap to restart, not new permission.
        onError(this.everStarted ? 'needs_tap' : 'mic_blocked');
      } else if (code === 'service-not-allowed') { this.active = false; onError('speech_service_off'); }
      else if (code === 'language-not-supported') { this.active = false; onError('lang_unsupported'); }
      else if (code === 'audio-capture') { this.active = false; onError('audio_capture'); }
      else if (code === 'network') onError('network');
      else onError(`speech_error:${code}`);
    };
    // Browsers end recognition after silence; keep listening until the user stops.
    r.onend = () => {
      if (!this.active) return;
      // Ending again and again straight away means the restart is not being accepted.
      if (Date.now() - this.startedAt < 1200) this.quickEnds++;
      if (this.quickEnds >= 3) { this.active = false; this.handlers?.onError('needs_tap'); return; }
      this.restartTimer = setTimeout(() => this.run(), 200);
    };
    this.rec = r;
    this.startedAt = Date.now();
    try {
      r.start();
    } catch (err) {
      if (!this.everStarted) throw err;
      this.active = false;
      onError('needs_tap');
    }
  }

  stop() {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try { this.rec?.abort(); } catch { /* already stopped */ }
    this.rec = null;
  }
}
