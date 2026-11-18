# Shabad Live

For a listener sitting in a gurdwara: one tap starts listening midway through live kirtan.
The app identifies the shabad, opens its complete Gurmukhi text and gently marks the pangti
being sung. Navigation is in English or Punjabi. Translation and Punjabi explanations are a
later phase.

**Phase 1 test link (web app, open on your phone):** https://iiswaranii.github.io/shabad-live/
On Android use Chrome; on iPhone use Safari. "Add to Home Screen" opens it full-screen like an app.
**Practice** mode on the home screen works anywhere, without kirtan or a microphone.

## Sung kirtan (raag, with instruments)

General speech recognisers (the browser's or the phone's) are trained on speech. On kirtan sung in
raag with harmonium and tabla they return few, broken words, which is why spoken path is recognised
and singing often is not. The app handles this on three levels:

1. **A kirtan-trained recogniser.** [Surt v3](https://huggingface.co/surindersinghssj/surt-small-v3)
   (Whisper-small fine-tuned on ~420 h of kirtan and ~240 h of sehaj path, Apache-2.0) converted to
   int8 ONNX (`tools/model/convert_surt.py`). Turn on **Kirtan model for singing** on the home screen.
   - **Server** (recommended): the phone sends short vocal-filtered audio chunks to a kirtan server,
     which returns Gurmukhi text; audio is transcribed in memory and discarded. Measured ~6 s per
     chunk on an Apple-silicon Mac CPU, which keeps up with live singing (~10–12 s highlight delay).
   - **On this phone** (experimental): runs in the browser with transformers.js. It works, but was
     measured at 27–86 s per chunk in a desktop browser, which is too slow for live kirtan today.
2. **Vocal focus.** Before recognition, audio is filtered to favour the voice: high-pass 150 Hz
   (tabla bayan, harmonium drone, hum), low-pass 5 kHz (cymbal, dayan ring), a presence boost and a
   compressor. Used by the kirtan model, and by Chrome's recogniser where it accepts an audio track.
   The harmonium shares the voice's range, so filtering reduces it but cannot remove it; a separation
   model is a possible next step.
3. **Matching built for sparse sung text.** About 24 s windows for identification (sung lines are
   slow) and only the latest words for line tracking; alaap vocables, held repeats and stray words in
   other scripts are dropped; words the recogniser split in two are rejoined; a phrase that many lines
   share counts for less; and a shabad opens by itself only after two different lines, one line heard
   clearly, or one short line heard completely.

Run a kirtan server on a computer and reach it from the phone over HTTPS:

```bash
npm run kirtan-server
```

```bash
cloudflared tunnel --url http://localhost:8787
```

Paste the `https://…trycloudflare.com` address into **Settings › Kirtan server address** and tap
**Test connection**. The server needs the converted model in `models-dist/` (see
`tools/model/convert_surt.py`).

Prior work this follows: *Live Gurbani Tracking: A Benchmark and Reference System for Captioning Sikh
Kirtan* ([arXiv 2607.13457](https://arxiv.org/abs/2607.13457)), whose reference system (a
kirtan-tuned 120M IndicConformer with fuzzy matching) reports 57.9% frame accuracy on real kirtan.
Its benchmark ([live-gurbani-captioning-benchmark-v1](https://github.com/karanbirsingh/live-gurbani-captioning-benchmark-v1),
annotations CC BY 4.0) is the natural next step for measuring this app on real recordings.

> Real-world recognition accuracy on kirtan audio is **unmeasured**. All measured figures below
> come from synthetic recogniser output. See [docs/EVALUATION.md](docs/EVALUATION.md) (spoken) and
> [docs/EVALUATION_SUNG.md](docs/EVALUATION_SUNG.md) (sung kirtan).

## What is in this repository

| Path | What it is |
|---|---|
| `packages/core` | Recognition engine (TypeScript, no platform dependencies): normalised Gurmukhi search index, candidate retrieval, shared-line ambiguity, resolution, live line tracking, listening controller, synthetic simulator. Used by the CLI, the API and the app. |
| `tools/importer` | Imports verified Gurbani from the Shabad OS database into corpus packs, with boundary and encoding checks. |
| `tools/cli` | **First runnable milestone**: command-line recogniser and evaluation (`synth`, `recognize`, `eval`). |
| `services/api` | Node.js HTTP service with the same engine and response contract, plus `POST /v1/transcribe` running the kirtan model. |
| `tools/model` | Converts the Surt v3 kirtan recogniser to int8 ONNX for the server and the browser. |
| `apps/mobile` | Expo / React Native app for iOS, Android and web. |
| `corpus/` | Imported packs: Sri Guru Granth Sahib Ji, Vaaran Bhai Gurdas Ji, Ghazals Bhai Nand Lal Ji, Sri Dasam Granth (optional). `IMPORT_REPORT.md` lists the checks. |
| `fixtures/synthetic`, `fixtures/synthetic-sung` | **Synthetic** labelled clips (10 shabads × 4 simulated performances each; spoken, and sung kirtan as heard by a general recogniser and by a kirtan model). Not audio. |
| `docs/` | Architecture notes, input formats, evaluation, review notes. |

## Architecture (compact)

```
 microphone ──► RecognitionAdapter ──► ListenController ──► EngineClient ──► RecognitionSession ──► EngineResponse ──► UI
                (replaceable)          overlapping ~24 s    Local (in app)    (packages/core)        listening | ambiguous |
                Web Speech / native /  windows every 1.5 s  or Remote (API)                          resolved | uncertain_line |
                kirtan model (server   drops stale replies                                           no_match
                or browser) / practice / typed
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

**Spoken / clearly recited** (`docs/EVALUATION.md`):

| | tune | held-out (30 clips) |
|---|---|---|
| correct automatic identification | 100% | 93.3% |
| wrong automatic opens | 0 | 0 |
| line accuracy, settled (excl. 3 s after a change) | 97.3% | 85.6% |
| median highlight delay | 2.7 s | 3.8 s |

**Sung kirtan** (`docs/EVALUATION_SUNG.md`, slow melismatic singing with alaap, repeated
half-lines, split and mis-heard words):

| held-out (10 clips each) | general recogniser on singing | kirtan model |
|---|---|---|
| correct automatic identification | 50% (40% left as a list to choose from) | 100% |
| wrong automatic opens | 2 in 10 clips | 0 |
| line accuracy, settled | 69.9% | 79.9% |
| median highlight delay | 10.0 s | 8.4 s |

Before the singing changes, the general-recogniser case identified 20–30% and opened a wrong shabad
in about half the clips. Proposed targets are listed in the evaluation reports; the general
recogniser on singing does not meet them, which is why the kirtan model is recommended.

Acceptance scenarios 1–5 run as automated tests against the full corpus
(`packages/core/test/acceptance.test.ts`), plus stale-response and paused-indicator tests and
an API test: **14 passing**. The kirtan model itself was checked end to end (server and browser)
on synthesised recitation only; no real kirtan recording has been run through it yet.

## Assumptions and missing inputs

- **No kirtan recordings were available.** Real-world accuracy is unmeasured. Needed next:
  ten shabads × three performances, with unseen raagis, distant phone recordings, instrumental
  passages and shared lines, labelled with line timings (format in
  [docs/INPUT_FORMATS.md](docs/INPUT_FORMATS.md)).
- **Recognisers:** the browser/phone speech service (`pa-IN`, `hi-IN` fallback) is the default;
  the Surt v3 kirtan model (author-reported kirtan WER 54.8%, CER 28.0%) is the recommended option
  for singing. Neither has been measured on real recordings in this repository yet.
- **Real kirtan benchmark:** the public live-Gurbani benchmark above has annotations under CC BY 4.0;
  its audio comes from YouTube, so downloading it needs a decision on YouTube's terms.
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
Kirtan recogniser: [Surt v3](https://huggingface.co/surindersinghssj/surt-small-v3) (Apache-2.0),
converted to ONNX; see `models-dist/surt-small-v3/NOTICE.md` on the published site.
Unicode conversion at import time by `gurmukhi-utils` (GPL-3.0, Shabad OS). It is not shipped
in the app.
