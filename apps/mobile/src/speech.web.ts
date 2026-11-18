// Web Speech API recogniser (Chrome on Android, Safari on iPhone).
// The browser's speech service may process audio on its own servers; the consent screen
// says so before capture. Nothing here records or stores audio.

import type { RecognitionAdapter } from '@shabad/core';

type SR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function ctor(): (new () => SR) | null {
  const w = globalThis as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupport = (): 'available' | 'unavailable' => (ctor() ? 'available' : 'unavailable');

export class SpeechAdapter implements RecognitionAdapter {
  readonly name = 'web-speech';
  private rec: SR | null = null;
  private active = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private lang: string) {}

  start({ onText, onError }: Parameters<RecognitionAdapter['start']>[0]) {
    const C = ctor();
    if (!C) throw new Error('speech_unavailable');
    this.active = true;
    const run = () => {
      if (!this.active) return;
      const r = new C();
      r.lang = this.lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const text = res[0]?.transcript ?? '';
          if (res.isFinal) onText(text, true);
          else interim += ' ' + text;
        }
        if (interim.trim()) onText(interim, false);
      };
      r.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.active = false; onError('mic_denied'); }
        else if (e.error === 'language-not-supported') { this.active = false; onError('lang_unsupported'); }
        // 'no-speech', 'aborted', 'network': the session ends and is restarted below.
      };
      // Browsers end recognition after silence; keep listening until the user stops.
      r.onend = () => { if (this.active) this.restartTimer = setTimeout(run, 250); };
      this.rec = r;
      try { r.start(); } catch { this.restartTimer = setTimeout(run, 500); }
    };
    run();
  }

  stop() {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try { this.rec?.abort(); } catch { /* already stopped */ }
    this.rec = null;
  }
}
