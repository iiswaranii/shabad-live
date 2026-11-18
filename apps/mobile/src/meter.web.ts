// On-device loudness meter for the listening animation (Web Audio AnalyserNode).
// Audio never leaves the device and is not stored: only loudness and a coarse spectrum are read.
//
// Some phones cannot share the microphone between the speech recogniser and a second capture.
// The meter therefore attaches only after recognition has started, and if recognition then
// fails, the meter is switched off for this device and the rings fall back to activity pulses.

import { levelBus, BAND_COUNT } from './level';

const KEY = 'shabad-live/meter-disabled';
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let raf = 0;
let attachedAt = 0;

export function meterAllowed(): boolean {
  try { return localStorage.getItem(KEY) !== '1'; } catch { return true; }
}

/** Create/resume the AudioContext. Call inside the Listen tap (iOS needs a gesture). */
export function primeMeter() {
  if (!meterAllowed()) return;
  try {
    const C = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!C) return;
    if (!ctx) ctx = new C();
    ctx!.resume?.();
  } catch { /* no Web Audio */ }
}

export async function attachMeter(): Promise<boolean> {
  if (!meterAllowed() || !ctx || stream || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    const freq = new Uint8Array(an.frequencyBinCount);
    const time = new Uint8Array(an.fftSize);
    const bands = new Float32Array(BAND_COUNT);
    const half = BAND_COUNT / 2;
    attachedAt = Date.now();
    const loop = () => {
      an.getByteFrequencyData(freq);
      an.getByteTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) { const v = (time[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / time.length);
      // Log-spaced bands over ~80 Hz–6 kHz, mirrored so the ring is symmetric.
      const maxBin = Math.min(freq.length - 1, Math.floor((6000 / (ctx!.sampleRate / 2)) * freq.length));
      for (let b = 0; b < half; b++) {
        const lo = Math.max(1, Math.floor(Math.pow(maxBin, b / half)));
        const hi = Math.max(lo + 1, Math.floor(Math.pow(maxBin, (b + 1) / half)));
        let m = 0;
        for (let i = lo; i < hi; i++) m = Math.max(m, freq[i]);
        const v = Math.pow(m / 255, 1.6);
        bands[b] = v; bands[BAND_COUNT - 1 - b] = v;
      }
      levelBus.push(Math.min(1, rms * 4.5), bands);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return true;
  } catch {
    detachMeter();
    return false;
  }
}

/** Recognition failed soon after the meter attached: assume the two conflict on this device. */
export function meterConflictSuspected(): boolean {
  if (!stream || Date.now() - attachedAt > 8000) return false;
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  detachMeter();
  return true;
}

export function detachMeter() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
