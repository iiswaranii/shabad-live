// On-device kirtan recogniser: Surt v3 (Whisper-small fine-tuned on ~420 h of kirtan and
// ~240 h of sehaj path; Apache-2.0, surindersinghssj/surt-small-v3), exported to int8 ONNX and
// run with transformers.js in a background worker. Audio is captured with the vocal-focus
// chain and never leaves the phone.

import type { RecognitionAdapter } from '@shabad/core';
import { primeVocal, startVocalCapture, type VocalCapture } from './vocal';

export const KIRTAN_MODEL = {
  id: 'surt-small-v3',
  // Served next to the app (GitHub Pages). Files over GitHub's 100 MB limit are split in parts.
  base: 'models/',
  approxMB: 250,
};

export type ModelStatus =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: number }
  | { phase: 'loading' }
  | { phase: 'ready'; device: string; lastMs?: number }
  | { phase: 'error'; message: string };

// The worker imports transformers.js from a pinned CDN build (the app bundler does not bundle
// web workers). It assembles split model files and keeps them in Cache Storage.
const WORKER_SRC = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const CACHE = 'shabad-kirtan-model-v1';
let asr = null;
async function fetchAssembled(url, parts, report) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  const blobs = [];
  for (let i = 0; i < parts; i++) {
    const r = await fetch(url + '.part' + i);
    if (!r.ok) throw new Error('model part ' + i + ' ' + r.status);
    blobs.push(await r.blob());
    report();
  }
  const res = new Response(new Blob(blobs), { headers: { 'content-type': 'application/octet-stream' } });
  await cache.put(url, res.clone());
  return res;
}
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      const base = new URL(m.base, m.page).href;
      const manifest = await (await fetch(base + m.model + '/parts.json')).json();
      const totalParts = Object.values(manifest.parts).reduce((a, b) => a + b, 0);
      let done = 0;
      const report = () => self.postMessage({ type: 'progress', progress: ++done / totalParts });
      // Self-hosted model: '<base><model>/<file>' on the app's own site.
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.remoteHost = base;
      env.remotePathTemplate = '{model}/';
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = {
        async match(key) {
          const url = typeof key === 'string' ? key : key.url;
          const name = url.split('/').pop();
          if (manifest.parts[name]) return fetchAssembled(url, manifest.parts[name], report);
          return (await caches.open(CACHE)).match(url);
        },
        async put(key, res) { const url = typeof key === 'string' ? key : key.url; await (await caches.open(CACHE)).put(url, res); },
      };
      self.postMessage({ type: 'loading' });
      asr = await pipeline('automatic-speech-recognition', m.model, { device: 'wasm', dtype: 'q8' });
      self.postMessage({ type: 'ready', device: 'wasm' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  } else if (m.type === 'run') {
    const t = performance.now();
    try {
      const out = await asr(m.audio, { language: 'punjabi', task: 'transcribe', no_repeat_ngram_size: 4 });
      self.postMessage({ type: 'text', text: out.text || '', ms: performance.now() - t });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
  }
};
`;

let worker: Worker | null = null;
let status: ModelStatus = { phase: 'idle' };
const listeners = new Set<(s: ModelStatus) => void>();
let pendingRun: ((r: { text: string; ms: number } | null) => void) | null = null;

function setStatus(s: ModelStatus) { status = s; listeners.forEach((l) => l(s)); }
export function onModelStatus(fn: (s: ModelStatus) => void) { listeners.add(fn); fn(status); return () => { listeners.delete(fn); }; }
export const kirtanModelSupported = () => typeof Worker !== 'undefined' && typeof caches !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** Download (first time) and load the model. Resolves when ready. */
export function loadKirtanModel(): Promise<void> {
  if (status.phase === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') setStatus({ phase: 'downloading', progress: m.progress });
        else if (m.type === 'loading') setStatus({ phase: 'loading' });
        else if (m.type === 'ready') setStatus({ phase: 'ready', device: m.device });
        else if (m.type === 'text') { if (status.phase === 'ready') setStatus({ ...status, lastMs: m.ms }); pendingRun?.({ text: m.text, ms: m.ms }); pendingRun = null; }
        else if (m.type === 'error') { setStatus({ phase: 'error', message: m.message }); pendingRun?.(null); pendingRun = null; }
      };
      worker.onerror = (e) => setStatus({ phase: 'error', message: e.message || 'worker failed' });
      setStatus({ phase: 'downloading', progress: 0 });
      worker.postMessage({ type: 'load', base: KIRTAN_MODEL.base, model: KIRTAN_MODEL.id, page: location.href });
    }
    const off = onModelStatus((s) => {
      if (s.phase === 'ready') { off(); resolve(); }
      else if (s.phase === 'error') { off(); reject(new Error(s.message)); }
    });
  });
}

function transcribe(audio: Float32Array): Promise<{ text: string; ms: number } | null> {
  return new Promise((resolve) => {
    pendingRun = resolve;
    worker!.postMessage({ type: 'run', audio }, [audio.buffer]);
  });
}

/** Whisper can loop on music: collapse a phrase repeated back-to-back. */
export function dropLoops(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= w.length; ) {
      const a = w.slice(i, i + n).join(' ');
      let j = i + n, reps = 0;
      while (j + n <= w.length && w.slice(j, j + n).join(' ') === a) { j += n; reps++; }
      if (reps >= 2) w.splice(i + n, reps * n - n); // keep at most two copies
      i += 1;
    }
  }
  return w.join(' ');
}

export type KirtanBackend = { kind: 'device' } | { kind: 'server'; url: string };

/** Check a kirtan server: reachable and with the model loaded. */
export async function checkKirtanServer(url: string): Promise<'ok' | 'no_model' | 'unreachable'> {
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/v1/health`, { cache: 'no-store' });
    if (!r.ok) return 'unreachable';
    return (await r.json()).kirtanModel ? 'ok' : 'no_model';
  } catch { return 'unreachable'; }
}

async function transcribeOnServer(url: string, audio: Float32Array): Promise<{ text: string; ms: number } | null> {
  const pcm = new Int16Array(audio.length);
  for (let i = 0; i < audio.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32767)));
  const r = await fetch(`${url.replace(/\/+$/, '')}/v1/transcribe`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pcm.buffer });
  if (r.status === 429) return null;
  if (!r.ok) throw new Error(`server ${r.status}`);
  return r.json();
}

export class KirtanModelAdapter implements RecognitionAdapter {
  readonly name = 'kirtan-model';
  private cap: VocalCapture | null = null;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Seconds per chunk reported by the recogniser, for the status line. */
  onTiming: ((ms: number) => void) | null = null;

  constructor(private backend: KirtanBackend = { kind: 'device' }) {}

  start({ onText, onError }: Parameters<RecognitionAdapter['start']>[0]) {
    primeVocal(); // inside the tap (iOS)
    this.active = true;
    const b = this.backend;
    (async () => {
      try {
        if (b.kind === 'device') await loadKirtanModel();
        else {
          const h = await checkKirtanServer(b.url);
          if (h !== 'ok') { onError(h === 'no_model' ? 'server_no_model' : 'server_unreachable'); return; }
        }
        if (!this.active) return;
        this.cap = await startVocalCapture();
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        onError(/Permission|NotAllowed/i.test(msg) ? 'mic_blocked' : `model_error:${msg.slice(0, 80)}`);
        return;
      }
      // Self-paced: whenever the recogniser is free, send the audio gathered since last time.
      // Whisper's cost per call is nearly fixed, so chunks of ~6–15 s keep up with live singing.
      let failures = 0;
      const loop = async () => {
        if (!this.active || !this.cap) return;
        if (this.cap.pending() >= 6) {
          let audio = this.cap.drain();
          if (audio.length > 16000 * 15) audio = audio.slice(audio.length - 16000 * 15);
          let sum = 0; for (let i = 0; i < audio.length; i += 4) sum += audio[i] * audio[i];
          const rms = Math.sqrt(sum / (audio.length / 4));
          if (rms > 0.004) {
            try {
              const r = b.kind === 'device' ? await transcribe(audio) : await transcribeOnServer(b.url, audio);
              failures = 0;
              if (r && this.active) { this.onTiming?.(r.ms); const text = dropLoops(r.text); if (text) onText(text, true); }
            } catch {
              if (++failures >= 3) { onError('server_unreachable'); failures = 0; }
            }
          }
        }
        if (this.active) this.timer = setTimeout(loop, 250);
      };
      loop();
    })();
  }

  stop() {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.cap?.stop();
    this.cap = null;
  }
}
