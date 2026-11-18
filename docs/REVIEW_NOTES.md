# Decisions that need a knowledgeable Punjabi / Gurbani reviewer

These were made to get a working first phase. Each one affects which shabad or line the app
shows, so a reviewer should confirm or correct it.

## Search normalisation (`packages/core/src/normalize.ts`)

1. **Word-final lagaan ignored for matching.** ਨਾਮੁ = ਨਾਮ, ਸਤਿ = ਸਤ. Rationale: modern Punjabi ASR
   writes the spoken form. Risk: pairs that differ only by a final aunkar or sihari become
   indistinguishable for matching (display is unchanged).
2. **Nasal marks (tippi, bindi), addak, nukta, virama ignored for the written-word key.**
3. **Phonetic skeleton classes:** aspirated and unaspirated pairs merge (ਕ/ਖ, ਗ/ਘ, ਚ/ਛ, ਜ/ਝ,
   ਤ/ਥ/ਟ/ਠ, ਦ/ਧ/ਡ/ਢ, ਪ/ਫ, ਬ/ਭ). ਣ/ਨ/ਙ/ਞ merge, ਰ/ੜ merge, ਸ/ਸ਼ merge. Vowels are
   dropped except a word-initial vowel, and tippi/bindi count as N, except before ਮ/ਬ/ਪ. Are any
   merges too aggressive for Gurbani as sung?
4. **ਰਹਾਉ treated as a structural marker**, not a sung word.
5. **Devanagari and romanised input** use parallel tables, so a Hindi-language recogniser or a
   typed roman query still matches.

## Corpus and indexing (`packages/core/src/corpus.ts`, `tools/importer`)

6. **Headings (Sirlekh) and Manglacharan are displayed but not indexed.** Manglacharan opens
   hundreds of shabads and cannot identify one. Is Mool Mantar ever sung in a way that should
   trigger recognition?
7. **Vishraam marks are stripped** from display text (gurmukhi-utils `stripVishraams`). Should
   the reader show vishraams for kirtan listeners?
8. **Footnote markers** (subscript digits in 37 raag headings) were removed from display.
9. **Bhai Nand Lal Ji's Persian text** contains `-` and `:` conventions from Shabad OS. They are
   kept as-is. Some forms, such as ਆੈ, look unusual and should be checked.
10. **Shared-line grouping** uses the normalised text, so two lines that differ only in
    lagaan or nasalisation are treated as the same pangti. Is that right for listing "the same
    line" across shabads?

## Kirtan structure (`packages/core/src/simulate.ts`; affects tests only)

11. The synthetic performances assume verses end at numbered ॥N॥ markers and the first Rahao line
    is the refrain. Real kirtan practice (asthayi choice, repetition patterns) should be checked
    against recordings.

## App text (`apps/mobile/src/i18n.ts`)

12. Every Punjabi navigation string is a first draft. In particular: "ਮਿਲਦੀ-ਜੁਲਦੀ — ਪੱਕਾ ਨਹੀਂ"
    (sound-alike, uncertain), "ਸਾਂਝੀ ਪੰਕਤੀ" (shared line), and the consent text.
