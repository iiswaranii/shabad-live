// Vocal-focus capture: microphone → filters that favour the singer's voice over tabla and
// harmonium → a processed audio track (for recognisers that accept one) and 16 kHz samples
// (for the on-device kirtan model). Audio stays in memory and is never stored or uploaded.
//
// What the chain does, and its limits:
//  - high-pass 150 Hz removes the tabla's bayan, the harmonium's low drone and hum;
//  - low-pass 5 kHz removes cymbal / chimta hiss and the dayan's ring;
//  - a presence boost around 2.5 kHz and a cut around 300 Hz favour vowels and consonants;
//  - a compressor evens out loud and soft singing.
// The harmonium and the voice share the same range, so filtering only reduces it. True vocal
// separation needs a separation model; the kirtan-trained recogniser is the bigger gain.

import { levelBus, BAND_COUNT } from './level';

export interface VocalCapture {
  /** Filtered audio as a MediaStreamTrack. */
  track: MediaStreamTrack;
  /** Take the 16 kHz mono samples captured since the last call. */
  drain(): Float32Array;
  /** Seconds of audio waiting to be drained. */
  pending(): number;
  stop(): void;
}

let ctx: AudioContext | null = null;

/** Create the AudioContext inside the tap (iOS requires a user gesture). */
export function primeVocal() {
  const C = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return;
  if (!ctx || ctx.state === 'closed') {
    try { ctx = new C({ sampleRate: 16000 }); } catch { ctx = new C(); }
  }
  ctx!.resume?.();
}

export async function startVocalCapture(): Promise<VocalCapture> {
  primeVocal();
  if (!ctx) throw new Error('no_web_audio');
  const stream = await navigator.mediaDevices.getUserMedia({
    // Noise suppression treats held sung vowels as noise, so it is left off for kirtan.
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  const src = ctx.createMediaStreamSource(stream);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150; hp.Q.value = 0.7;
  const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 150; hp2.Q.value = 0.7;
  const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 300; mud.Q.value = 1; mud.gain.value = -3;
  const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 2500; presence.Q.value = 0.9; presence.gain.value = 4;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.7;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -30; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
  src.connect(hp).connect(hp2).connect(mud).connect(presence).connect(lp).connect(comp);

  const dest = ctx.createMediaStreamDestination();
  comp.connect(dest);

  // Collect samples at 16 kHz (resample if the context could not be created at 16 kHz).
  const ratio = ctx.sampleRate / 16000;
  const chunks: Float32Array[] = [];
  let count = 0;
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const an = ctx.createAnalyser(); an.fftSize = 256;
  const freq = new Uint8Array(an.frequencyBinCount);
  const bands = new Float32Array(BAND_COUNT);
  comp.connect(an);
  proc.onaudioprocess = (e) => {
    const x = e.inputBuffer.getChannelData(0);
    const n = Math.floor(x.length / ratio);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = x[Math.floor(i * ratio)];
    chunks.push(y); count += n;
    while (count > 16000 * 40) count -= chunks.shift()!.length; // keep at most 40 s
    // Drive the listening rings from the same (vocal-filtered) signal.
    let sum = 0; for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    an.getByteFrequencyData(freq);
    const half = BAND_COUNT / 2;
    for (let b = 0; b < half; b++) { const v = Math.pow(freq[2 + Math.floor((b / half) * 80)] / 255, 1.6); bands[b] = v; bands[BAND_COUNT - 1 - b] = v; }
    levelBus.push(Math.min(1, Math.sqrt(sum / x.length) * 5), bands);
  };
  comp.connect(proc);
  const mute = ctx.createGain(); mute.gain.value = 0;
  proc.connect(mute).connect(ctx.destination); // ScriptProcessor only runs when connected

  return {
    track: dest.stream.getAudioTracks()[0],
    pending: () => count / 16000,
    drain() {
      const out = new Float32Array(count);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      chunks.length = 0; count = 0;
      return out;
    },
    stop() {
      proc.disconnect(); src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
