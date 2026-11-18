// Native recogniser (iOS SFSpeechRecognizer / Android SpeechRecognizer) through
// expo-speech-recognition. Needs a development or store build: Expo Go does not include the
// native module, so it reports 'needs_build' and the app offers Practice mode instead.
// Audio is not persisted (recordingOptions.persist is left off). Loudness for the listening
// rings comes from the recogniser's own `volumechange` events.

import type { RecognitionAdapter } from '@shabad/core';
import { levelBus } from './level';

let mod: any = null;
try {
  mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  if (!mod?.start) mod = null;
} catch {
  mod = null;
}

export const speechSupport = (): 'available' | 'needs_build' | 'unavailable' => {
  if (!mod) return 'needs_build';
  try { return mod.isRecognitionAvailable() ? 'available' : 'unavailable'; } catch { return 'unavailable'; }
};
export const isIOS = () => false;
export const isStandalone = () => false;

export class SpeechAdapter implements RecognitionAdapter {
  readonly name = 'native-speech';
  private active = false;
  private subs: { remove(): void }[] = [];
  private handlers: Parameters<RecognitionAdapter['start']>[0] | null = null;
  onAudioStart: (() => void) | null = null;

  constructor(private lang: string) {}

  private begin = () => {
    if (!this.active) return;
    mod.start({ lang: this.lang, interimResults: true, continuous: true, addsPunctuation: false, volumeChangeEventOptions: { enabled: true, intervalMillis: 60 } });
  };

  async start(handlers: Parameters<RecognitionAdapter['start']>[0]) {
    if (!mod) throw new Error('needs_build');
    this.handlers = handlers;
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) throw new Error('mic_blocked');
    this.active = true;
    const { onText, onError } = handlers;
    this.subs = [
      mod.addListener('result', (e: any) => { onText(e.results?.[0]?.transcript ?? '', !!e.isFinal); levelBus.pulse(0.6); }),
      mod.addListener('volumechange', (e: any) => levelBus.push(Math.max(0, Math.min(1, ((e.value ?? -2) + 2) / 12)))),
      mod.addListener('error', (e: any) => {
        if (e.error === 'not-allowed') { this.active = false; onError('mic_blocked'); }
        else if (e.error === 'service-not-allowed') { this.active = false; onError('speech_service_off'); }
        else if (e.error === 'language-not-supported') { this.active = false; onError('lang_unsupported'); }
      }),
      mod.addListener('end', () => { if (this.active) setTimeout(this.begin, 250); }),
    ];
    this.begin();
  }

  resume() {
    this.active = true;
    this.begin();
  }

  stop() {
    this.active = false;
    try { mod?.abort(); } catch { /* not running */ }
    for (const s of this.subs) s.remove();
    this.subs = [];
  }
}
