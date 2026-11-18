// Server-side kirtan recogniser: Surt v3 (Whisper-small fine-tuned on kirtan + sehaj path,
// Apache-2.0) as int8 ONNX, run with transformers.js on onnxruntime-node.
// Audio arrives as 16 kHz mono PCM, is transcribed in memory and discarded. Nothing is stored.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const MODEL = 'surt-small-v3';
type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string }>;
let asr: Asr | null = null;
let loading: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

/** models-dist stores large files in parts (GitHub limit); assemble them into a cache dir once. */
function prepare(dir: string): string {
  const src = join(dir, MODEL);
  if (!existsSync(join(src, 'config.json'))) throw new Error(`kirtan model not found in ${src} (see tools/model/convert_surt.py)`);
  const root = join(tmpdir(), 'shabad-live-models');
  const dst = join(root, MODEL);
  mkdirSync(join(dst, 'onnx'), { recursive: true });
  for (const f of readdirSync(src)) if (statSync(join(src, f)).isFile()) copyFileSync(join(src, f), join(dst, f));
  const parts: Record<string, number> = existsSync(join(src, 'parts.json')) ? JSON.parse(readFileSync(join(src, 'parts.json'), 'utf8')).parts : {};
  for (const f of readdirSync(join(src, 'onnx'))) {
    if (/\.part\d+$/.test(f)) continue;
    copyFileSync(join(src, 'onnx', f), join(dst, 'onnx', f));
  }
  for (const [name, n] of Object.entries(parts)) {
    const out = join(dst, 'onnx', name);
    if (existsSync(out)) continue;
    const fd = openSync(out, 'w');
    for (let i = 0; i < n; i++) writeSync(fd, readFileSync(join(src, 'onnx', `${name}.part${i}`)));
    closeSync(fd);
  }
  return root;
}

export function loadKirtanAsr(dir: string): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = prepare(dir) + '/';
      asr = (await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' })) as unknown as Asr;
    })();
  }
  return loading;
}

export const asrReady = () => asr !== null;

/** Whisper can loop on instrumental passages: keep at most two copies of a repeated phrase. */
export function dropLoops(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + 2 * n <= w.length; i++) {
      const a = w.slice(i, i + n).join(' ');
      let j = i + n, reps = 0;
      while (j + n <= w.length && w.slice(j, j + n).join(' ') === a) { j += n; reps++; }
      if (reps >= 2) w.splice(i + n, reps * n - n);
    }
  }
  return w.join(' ');
}

/** Transcribe 16 kHz mono samples. Requests run one at a time; callers self-pace. */
export function transcribe(audio: Float32Array): Promise<{ text: string; ms: number }> {
  if (!asr) return Promise.reject(new Error('model not loaded'));
  waiting++;
  const run = queue.then(async () => {
    const t = Date.now();
    const out = await asr!(audio, { language: 'punjabi', task: 'transcribe', no_repeat_ngram_size: 4 });
    return { text: dropLoops(out.text ?? ''), ms: Date.now() - t };
  }).finally(() => { waiting--; });
  queue = run.catch(() => undefined);
  return run;
}

export const backlog = () => waiting;
