# Shabad Live

For a listener sitting in a gurdwara: one tap starts listening midway through live kirtan.
The app identifies the shabad, opens its complete Gurmukhi text and gently marks the pangti
being sung. Navigation is in English or Punjabi. Translation and Punjabi explanations are a
later phase.

**Phase 1 test link (web app, open on your phone):** https://iiswaranii.github.io/shabad-live/
On Android use Chrome; on iPhone use Safari. "Add to Home Screen" opens it full-screen like an app.
**Practice** mode on the home screen works anywhere, without kirtan or a microphone.

> Real-world recognition accuracy on kirtan audio is **unmeasured**. All measured figures below
> come from synthetic recogniser output. See [docs/EVALUATION.md](docs/EVALUATION.md).

## What is in this repository

| Path | What it is |
|---|---|
| `packages/core` | Recognition engine (TypeScript, no platform dependencies): normalised Gurmukhi search index, candidate retrieval, shared-line ambiguity, resolution, live line tracking, listening controller, synthetic simulator. Used by the CLI, the API and the app. |
| `tools/importer` | Imports verified Gurbani from the Shabad OS database into corpus packs, with boundary and encoding checks. |
| `tools/cli` | **First runnable milestone**: command-line recogniser and evaluation (`synth`, `recognize`, `eval`). |
| `services/api` | Node.js HTTP service with the same engine and response contract, for a future server-side recogniser. |
| `apps/mobile` | Expo / React Native app for iOS, Android and web. |
| `corpus/` | Imported packs: Sri Guru Granth Sahib Ji, Vaaran Bhai Gurdas Ji, Ghazals Bhai Nand Lal Ji, Sri Dasam Granth (optional). `IMPORT_REPORT.md` lists the checks. |
| `fixtures/synthetic` | **Synthetic** labelled clips (10 shabads × 4 simulated performances). Not audio. |
| `docs/` | Architecture notes, input formats, evaluation, review notes. |

## Architecture (compact)

```
 microphone ──► RecognitionAdapter ──► ListenController ──► EngineClient ──► RecognitionSession ──► EngineResponse ──► UI
                (replaceable)          overlapping 6 s      Local (in app)    (packages/core)        listening | ambiguous |
                Web Speech / native /  windows every 1.5 s  or Remote (API)                          resolved | uncertain_line |
                practice / typed       drops stale replies                                           no_match
```

1. **Corpus.** Original Unicode text is kept for display. A separate index holds, for each word,
   a *loose* written form (nasal marks, addak, nukta and word-final lagaan removed) and a
   *phonetic skeleton* shared by Gurmukhi, Devanagari and romanised input. Every token maps back
   to its original line. Lines with identical normalised text form a *group*, so shared pangtis
   keep all their distinct shabad IDs.
2. **Retrieval.** Ordered word pairs (adjacent and skip-one, which tolerates a missed word) and
   rare single words pull candidate lines from the **entire selected corpus**. Each candidate is
   scored by local alignment that allows missed words, extra words, nearby swaps and spelling
   variation, weighted by word rarity, so a single common word is weak evidence.
3. **Identification.** Evidence is kept per heard line. Overlapping windows are merged, never
   double-counted. A repeat of a line, such as the refrain, adds no support. A phrase that many
   lines share equally counts for less. A shabad opens automatically only when fresh audio
   supports a distinguishing line with a clear margin over the runner-up. Otherwise the app shows
   the heard pangti once, with every exact match and, separately labelled, the uncertain
   sound-alikes. It keeps listening while that list is open.
4. **Tracking.** Once a shabad is open, each window is aligned to that shabad's lines. The
   marker can move back to the refrain, skip a verse or stay on a repeated line. If two places
   remain plausible, the live indicator pauses until fresh evidence arrives. Time passing never
   moves it. A user's choice is kept until they change it.

## Setup

Requires Node 22+.

```bash
npm install
```

```bash
npm test
```

```bash
npm run eval -- --split all --report docs/EVALUATION.md
```

```bash
npm run recognize -- --clip MRB-B
```

```bash
npm run api
```

Run the app (web in the browser, or scan the QR code with Expo Go on a phone):

```bash
npm run -w apps/mobile web
```

Re-import the corpus from a Shabad OS SQLite database (`npm view @shabados/database`):

```bash
node tools/importer/import.js --db path/to/shabados.sqlite --sources 1,3,5,2 --out corpus
```

Build the web app, and publish it to GitHub Pages (`gh-pages` branch):

```bash
npm run web:build
```

```bash
npm run web:deploy
```

## Results (measured on synthetic recogniser output only)

From `npm run eval` (searching Sri Guru Granth Sahib Ji, Vaaran Bhai Gurdas Ji and Bhai Nand
Lal Ji, 6,554 shabads). Performance A was used for tuning; B–D were held out.

| | tune (A) | held-out (B–D) |
|---|---|---|
| correct automatic identification | 100% (10/10) | 93.3% (28/30) |
| wrong automatic opens | 0 | 1 in 30 clips (distant-phone, shared-refrain shabad) |
| unresolved (left for the listener to choose) | 0% | 3.3% |
| candidate recall | 100% | 100% |
| line accuracy, settled (excl. 3 s after a change) | 97.4% | 86.2% |
| median highlight delay | 2.5 s | 3.8 s |
| new line asserted during instrumentals | 0 | 3 |

Proposed targets (not yet met or measured on real audio) are listed in
[docs/EVALUATION.md](docs/EVALUATION.md). The one wrong automatic open in 30 clips misses the
proposed ≤ 1 in 100 target.

Acceptance scenarios 1–5 run as automated tests against the full corpus
(`packages/core/test/acceptance.test.ts`), plus stale-response and paused-indicator tests and
an API test: **14 passing**.

## Assumptions and missing inputs

- **No kirtan recordings were available.** Real-world accuracy is unmeasured. Needed next:
  ten shabads × three performances, with unseen raagis, distant phone recordings, instrumental
  passages and shared lines, labelled with line timings (format in
  [docs/INPUT_FORMATS.md](docs/INPUT_FORMATS.md)).
- **No singing-tested Punjabi recogniser has been evaluated yet.** The web app uses the
  browser's speech service (`pa-IN`, with `hi-IN` as a fallback setting); native builds use the
  phone's recogniser. Both are baselines to test on singing before choosing a production model.
- **Corpus:** Shabad OS Database 4.8.7 (Gurbani text: Public Domain Mark; IDs and organisation:
  CC BY-SA 4.0). Imported with boundary checks. Proofreading against a printed saroop is still
  required before release.
- **Linguistic decisions need a knowledgeable Punjabi reviewer:** see
  [docs/REVIEW_NOTES.md](docs/REVIEW_NOTES.md).

## Next mobile integration step

Build an installable development build (`npx expo prebuild` then run on device, or EAS
Build) so `expo-speech-recognition` provides live recognition on iPhone and Android outside
the browser. Then record real performances with the app's capture path and add them to the
evaluation as the first measured real-world figures. Expo Go runs the app, but only in Practice
and typed modes.

## Credits

Gurbani text and IDs from the [Shabad OS Database](https://github.com/ShabadOS/database).
Unicode conversion at import time by `gurmukhi-utils` (GPL-3.0, Shabad OS). It is not shipped
in the app.
