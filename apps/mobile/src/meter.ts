// Native builds get loudness from the recogniser's own `volumechange` events (see speech.ts),
// so no second microphone capture is needed.
export const meterAllowed = () => false;
export const primeMeter = () => {};
export const attachMeter = async () => false;
export const meterConflictSuspected = () => false;
export const detachMeter = () => {};
