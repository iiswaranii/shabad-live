// Search normalisation. Display text is never changed; these keys exist only in the index.
//
// Two keys per word:
//  - `loose`: Gurmukhi with nasal marks, addak, virama, nukta and word-final lagaan
//    (aunkar / sihari) removed. Modern Punjabi ASR writes ਨਾਮੁ as ਨਾਮ and ਸਤਿ as ਸਤ,
//    so this is the "same written word" test.
//  - `skel`: a phonetic consonant skeleton shared by Gurmukhi, Devanagari and Latin
//    input. Aspirated/unaspirated and dental/retroflex pairs collapse to one class,
//    vowels are dropped except a word-initial vowel, tippi/bindi count as N.
//    This tolerates sung vowels, sustained syllables and Hindi or romanised ASR output.
//
// REVIEW (Punjabi reviewer): the class table and lagaan rule below are linguistic
// decisions. See docs/REVIEW_NOTES.md.

export type Script = 'gurmukhi' | 'devanagari' | 'latin' | 'other';

const GURMUKHI_CLASS: Record<string, string> = {
  'ਕ': 'K', 'ਖ': 'K', 'ਖ਼': 'K', 'ਗ': 'G', 'ਘ': 'G', 'ਗ਼': 'G', 'ਙ': 'N',
  'ਚ': 'C', 'ਛ': 'C', 'ਜ': 'J', 'ਝ': 'J', 'ਜ਼': 'J', 'ਞ': 'N',
  'ਟ': 'T', 'ਠ': 'T', 'ਤ': 'T', 'ਥ': 'T',
  'ਡ': 'D', 'ਢ': 'D', 'ਦ': 'D', 'ਧ': 'D',
  'ਣ': 'N', 'ਨ': 'N', 'ਪ': 'P', 'ਫ': 'P', 'ਫ਼': 'P', 'ਬ': 'B', 'ਭ': 'B', 'ਮ': 'M',
  'ਯ': 'Y', 'ਰ': 'R', 'ੜ': 'R', 'ਲ': 'L', 'ਲ਼': 'L', 'ਵ': 'V',
  'ਸ': 'S', 'ਸ਼': 'S', 'ਹ': 'H',
};
const GURMUKHI_VOWELS = new Set(['ਅ', 'ਆ', 'ਇ', 'ਈ', 'ਉ', 'ਊ', 'ਏ', 'ਐ', 'ਓ', 'ਔ', 'ੲ', 'ੳ']);
const GURMUKHI_NASAL = new Set(['ਂ', 'ੰ', 'ਁ']);

const DEVANAGARI_CLASS: Record<string, string> = {
  'क': 'K', 'ख': 'K', 'क़': 'K', 'ख़': 'K', 'ग': 'G', 'घ': 'G', 'ग़': 'G', 'ङ': 'N',
  'च': 'C', 'छ': 'C', 'ज': 'J', 'झ': 'J', 'ज़': 'J', 'ञ': 'N',
  'ट': 'T', 'ठ': 'T', 'त': 'T', 'थ': 'T',
  'ड': 'D', 'ढ': 'D', 'द': 'D', 'ध': 'D', 'ड़': 'R', 'ढ़': 'R',
  'ण': 'N', 'न': 'N', 'प': 'P', 'फ': 'P', 'फ़': 'P', 'ब': 'B', 'भ': 'B', 'म': 'M',
  'य': 'Y', 'र': 'R', 'ल': 'L', 'ळ': 'L', 'व': 'V',
  'श': 'S', 'ष': 'S', 'स': 'S', 'ह': 'H',
};
const DEVANAGARI_VOWELS = new Set(['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ', 'ऋ']);
const DEVANAGARI_NASAL = new Set(['ं', 'ँ']);

// Latin: longest match first.
const LATIN_UNITS: [string, string][] = [
  ['chh', 'C'], ['ch', 'C'], ['kh', 'K'], ['gh', 'G'], ['jh', 'J'], ['th', 'T'], ['dh', 'D'],
  ['ph', 'P'], ['bh', 'B'], ['sh', 'S'], ['rh', 'R'],
  ['k', 'K'], ['q', 'K'], ['c', 'C'], ['g', 'G'], ['j', 'J'], ['z', 'J'], ['t', 'T'], ['d', 'D'],
  ['p', 'P'], ['f', 'P'], ['b', 'B'], ['s', 'S'], ['n', 'N'], ['m', 'M'], ['y', 'Y'],
  ['r', 'R'], ['l', 'L'], ['v', 'V'], ['w', 'V'], ['h', 'H'], ['x', 'KS'],
];
const LATIN_VOWEL = /[aeiou]/;

/** Tokens that structure a line but are not sung as words. */
const STRUCTURAL = new Set(['ਰਹਾਉ', 'ਰਹਾਉ।']);

export function detectScript(text: string): Script {
  let g = 0, d = 0, l = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0a00 && c <= 0x0a7f) g++;
    else if (c >= 0x0900 && c <= 0x097f) d++;
    else if (/[a-z]/i.test(ch)) l++;
  }
  const max = Math.max(g, d, l);
  if (max === 0) return 'other';
  return max === g ? 'gurmukhi' : max === d ? 'devanagari' : 'latin';
}

/** Split text into word strings, dropping dandas, digits and punctuation. */
export function words(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[।॥|;.,:!?"'()\[\]{}–—-]/g, ' ')
    .replace(/[0-9੦-੯०-९]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && /[ਅ-ੴअ-ॿa-z]/i.test(w) && !STRUCTURAL.has(w));
}

/** NFC code points. */
function chars(word: string): string[] {
  return Array.from(word.normalize('NFC'));
}

function collapse(s: string): string {
  let out = '';
  for (const ch of s) if (out[out.length - 1] !== ch) out += ch;
  return out;
}

function gurmukhiSkeleton(word: string): string {
  let out = '';
  const cs = chars(word);
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i];
    // NFC keeps nukta letters decomposed (base + nukta); each shares its base letter's class.
    if (ch === '\u0A3C') continue;
    if (ch === '\u0A74') { out += 'AKNKR'; continue; } // ੴ
    const cls = GURMUKHI_CLASS[ch];
    if (cls) { out += cls; continue; }
    if (GURMUKHI_VOWELS.has(ch)) { if (out === '') out += 'A'; continue; }
    if (GURMUKHI_NASAL.has(ch)) {
      // Tippi before ਮ/ਬ/ਪ is assimilated (ਅੰਮ੍ਰਿਤ ~ amrit).
      const next = GURMUKHI_CLASS[cs[i + 1] ?? ''];
      if (next !== 'M' && next !== 'B' && next !== 'P') out += 'N';
    }
    // vowel signs, addak, virama, udaat, yakash: dropped
  }
  return collapse(out);
}

function devanagariSkeleton(word: string): string {
  let out = '';
  const cs = chars(word);
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i];
    if (ch === '\u093C') continue;
    // ड़ / ढ़ (base + nukta) are flaps, like ੜ.
    if ((ch === 'ड' || ch === 'ढ') && cs[i + 1] === '\u093C') { out += 'R'; i++; continue; }
    const cls = DEVANAGARI_CLASS[ch];
    if (cls) { out += cls; continue; }
    if (DEVANAGARI_VOWELS.has(ch)) { if (out === '') out += 'A'; continue; }
    if (DEVANAGARI_NASAL.has(ch)) {
      const next = DEVANAGARI_CLASS[cs[i + 1] ?? ''];
      if (next !== 'M' && next !== 'B' && next !== 'P') out += 'N';
    }
  }
  return collapse(out);
}

function latinSkeleton(word: string): string {
  const w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  let out = '';
  let i = 0;
  if (LATIN_VOWEL.test(w[0] ?? '')) out = 'A';
  while (i < w.length) {
    const unit = LATIN_UNITS.find(([u]) => w.startsWith(u, i));
    if (unit) { out += unit[1]; i += unit[0].length; } else i++;
  }
  return collapse(out);
}

export function skeleton(word: string, script: Script = detectScript(word)): string {
  if (script === 'gurmukhi') return gurmukhiSkeleton(word);
  if (script === 'devanagari') return devanagariSkeleton(word);
  if (script === 'latin') return latinSkeleton(word);
  return '';
}

/** Gurmukhi "same written word" key; null for other scripts. */
export function loose(word: string): string | null {
  if (detectScript(word) !== 'gurmukhi') return null;
  let w = word.normalize('NFC')
    .replace(/[ਁਂੰੱ੍ੑੵ਼ਃ]/g, '')
    .replace(/ਸ਼/g, 'ਸ').replace(/ਖ਼/g, 'ਖ').replace(/ਗ਼/g, 'ਗ').replace(/ਜ਼/g, 'ਜ').replace(/ਫ਼/g, 'ਫ').replace(/ਲ਼/g, 'ਲ');
  // Word-final lagaan matras are grammatical markers, rarely pronounced or transcribed.
  if (w.length > 1) w = w.replace(/[ੁਿ]$/, '');
  return w;
}

export interface Token {
  skel: string;
  loose: string | null;
}

export function tokenize(text: string): Token[] {
  return words(text)
    .map((w) => ({ skel: skeleton(w), loose: loose(w) }))
    .filter((t) => t.skel.length > 0);
}

/** Gurmukhi → Devanagari by the parallel Unicode blocks; used to simulate Hindi ASR output. */
export function gurmukhiToDevanagari(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (ch === 'ੰ') out += 'ं';
    else if (ch === 'ੱ') continue;
    else if (ch === 'ੜ') out += 'ड़';
    else if (ch === 'ੲ' || ch === 'ੳ') out += 'अ';
    else if (c >= 0x0a00 && c <= 0x0a6f) out += String.fromCodePoint(c - 0x100);
    else out += ch;
  }
  return out.normalize('NFC');
}

/**
 * Tokens for recogniser output (not for corpus text). Sung kirtan comes back with alaap
 * vocables, held repeats and stray words in other scripts; those carry no evidence.
 */
export function queryTokens(text: string): Token[] {
  const ws = words(text);
  const scripts = ws.map((w) => detectScript(w));
  const indic = scripts.filter((x) => x === 'gurmukhi' || x === 'devanagari').length;
  let toks = ws
    // A mostly-Gurmukhi transcript with a few Latin words: the Latin words are mis-hearings.
    .filter((_, i) => !(scripts[i] === 'latin' && indic >= ws.length * 0.6))
    .map((w) => ({ skel: skeleton(w), loose: loose(w) }))
    // Vocables: pure vowels / a bare "ਹ" sound (ਆ, ਓ, ਹੋ, ਹਾਂ).
    .filter((t) => t.skel.length > 0 && !VOCABLE_SKELETONS.has(t.skel));
  // Held repeats: keep at most two of the same word in a row (Gurbani has ਹਰਿ ਹਰਿ).
  toks = toks.filter((t, i) => !(i >= 2 && toks[i - 1].skel === t.skel && toks[i - 2].skel === t.skel));
  return toks;
}
const VOCABLE_SKELETONS = new Set(['A', 'AN', 'H', 'AH', 'HN']);

/** Join two recogniser tokens that may be one sung word split in two (ਪ੍ਰ + ਭੂ). */
export function joinTokens(a: Token, b: Token): Token {
  const tail = b.skel.startsWith('A') ? b.skel.slice(1) : b.skel;
  let skel = '';
  for (const ch of a.skel + tail) if (skel[skel.length - 1] !== ch) skel += ch;
  return { skel, loose: a.loose !== null && b.loose !== null ? a.loose + b.loose : null };
}
