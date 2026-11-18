// A shared, platform-neutral sound level used only to animate the listening rings.
// Sources: the web loudness meter (Web Audio, on device), native recogniser volume events,
// recogniser activity, or Practice playback. Nothing is recorded.

const BANDS = 48;

class LevelBus {
  /** Smoothed loudness 0..1. */
  level = 0;
  /** Per-bar heights 0..1 around the ring. */
  readonly bands = new Float32Array(BANDS);
  /** Increments on each detected beat (onset). */
  beats = 0;
  /** True when a real loudness signal (not just activity pulses) is arriving. */
  measured = false;

  private target = 0;
  private realBands: Float32Array | null = null;
  private lastReal = 0;
  private avg = 0;
  private lastBeat = 0;
  private t = 0;

  /** Real loudness 0..1, optionally with spectrum bands. */
  push(level: number, bands?: Float32Array) {
    this.target = Math.max(0, Math.min(1, level));
    if (bands) this.realBands = bands;
    this.lastReal = now();
    this.measured = true;
  }

  /** A burst of activity when no loudness meter is available (speech detected, a word arrived). */
  pulse(strength: number) {
    if (this.measured && now() - this.lastReal < 1000) return;
    this.target = Math.max(this.target, strength);
  }

  reset() {
    this.level = 0; this.target = 0; this.avg = 0; this.bands.fill(0); this.realBands = null; this.measured = false;
  }

  /** Advance by dt seconds. Returns true on a beat. */
  tick(dt: number): boolean {
    this.t += dt;
    if (this.measured && now() - this.lastReal > 1500) { this.measured = false; this.realBands = null; }
    // Fast attack, slow release, like a VU meter.
    const k = this.target > this.level ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 5);
    this.level += (this.target - this.level) * k;
    if (!this.measured) this.target *= Math.exp(-dt * 2.2); // pulses fade out
    this.avg += (this.level - this.avg) * (1 - Math.exp(-dt * 1.5));

    for (let i = 0; i < BANDS; i++) {
      const real = this.realBands ? this.realBands[i % this.realBands.length] : -1;
      const wobble = 0.55 + 0.45 * Math.sin(this.t * (2.1 + (i % 7) * 0.37) + i * 1.7);
      const want = real >= 0 ? real : this.level * wobble;
      const b = this.bands[i];
      this.bands[i] = b + (want - b) * (want > b ? 0.5 : 0.15);
    }

    const tNow = now();
    if (this.level > 0.12 && this.level > this.avg * 1.35 + 0.04 && tNow - this.lastBeat > 220) {
      this.lastBeat = tNow;
      this.beats++;
      return true;
    }
    return false;
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const levelBus = new LevelBus();
export const BAND_COUNT = BANDS;

// One animation-frame loop ticks the bus for every subscriber (orb, mini waveform).
type FrameFn = (beat: boolean, dt: number) => void;
const subs = new Set<FrameFn>();
let frame = 0;
let last = 0;
function loop(ts: number) {
  const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 60;
  last = ts;
  const beat = levelBus.tick(dt);
  for (const f of subs) f(beat, dt);
  frame = subs.size ? requestAnimationFrame(loop) : 0;
}
export function subscribeFrames(fn: FrameFn) {
  subs.add(fn);
  if (!frame) { last = 0; frame = requestAnimationFrame(loop); }
  return () => { subs.delete(fn); if (!subs.size && frame) { cancelAnimationFrame(frame); frame = 0; } };
}
