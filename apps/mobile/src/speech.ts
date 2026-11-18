// Native recogniser (iOS SFSpeechRecognizer / Android SpeechRecognizer) through
// expo-speech-recognition. Needs a development or store build: Expo Go does not include the
// native module, so it reports 'needs_build' and the app offers Practice mode instead.
// Audio is not persisted (recordingOptions.persist is left off).

import type { RecognitionAdapter } from '@shabad/core';

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

export class SpeechAdapter implements RecognitionAdapter {
  readonly name = 'native-speech';
  private active = false;
  private subs: { remove(): void }[] = [];

  constructor(private lang: string) {}

  async start({ onText, onError }: Parameters<RecognitionAdapter['start']>[0]) {
    if (!mod) throw new Error('needs_build');
    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) throw new Error('mic_denied');
    this.active = true;
    const begin = () => {
      if (!this.active) return;
      mod.start({ lang: this.lang, interimResults: true, continuous: true, addsPunctuation: false });
    };
    this.subs = [
      mod.addListener('result', (e: any) => onText(e.results?.[0]?.transcript ?? '', !!e.isFinal)),
      mod.addListener('error', (e: any) => {
        if (e.error === 'not-allowed') { this.active = false; onError('mic_denied'); }
        else if (e.error === 'language-not-supported') { this.active = false; onError('lang_unsupported'); }
      }),
      mod.addListener('end', () => { if (this.active) setTimeout(begin, 250); }),
    ];
    begin();
  }

  stop() {
    this.active = false;
    try { mod?.abort(); } catch { /* not running */ }
    for (const s of this.subs) s.remove();
    this.subs = [];
  }
}
