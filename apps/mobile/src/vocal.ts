// Native builds: the platform recogniser captures audio itself; vocal filtering and the
// on-device kirtan model are web-only in this phase (see README, next steps).
export interface VocalCapture { track: unknown; drain(): Float32Array; pending(): number; stop(): void }
export const primeVocal = () => {};
export const startVocalCapture = async (): Promise<VocalCapture> => { throw new Error('kirtan_model_web_only'); };
