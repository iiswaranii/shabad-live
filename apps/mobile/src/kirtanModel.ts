// Native builds: the on-device kirtan model is web-only in this phase. A native port would run
// the same ONNX files with onnxruntime-react-native (see README, next steps).
import type { RecognitionAdapter } from '@shabad/core';

export const KIRTAN_MODEL = { id: 'surt-small-v3', base: 'models/', approxMB: 250 };
export type ModelStatus =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: number }
  | { phase: 'loading' }
  | { phase: 'ready'; device: string; lastMs?: number }
  | { phase: 'error'; message: string };
export const onModelStatus = (fn: (s: ModelStatus) => void) => { fn({ phase: 'idle' }); return () => {}; };
export const kirtanModelSupported = () => false;
export const loadKirtanModel = async () => { throw new Error('kirtan_model_web_only'); };
export const dropLoops = (t: string) => t;
export type KirtanBackend = { kind: 'device' } | { kind: 'server'; url: string };
export const checkKirtanServer = async (_url: string): Promise<'ok' | 'no_model' | 'unreachable'> => 'unreachable';
export class KirtanModelAdapter implements RecognitionAdapter {
  readonly name = 'kirtan-model';
  onTiming: ((ms: number) => void) | null = null;
  constructor(_b?: KirtanBackend) {}
  start() { throw new Error('kirtan_model_web_only'); }
  stop() {}
}
