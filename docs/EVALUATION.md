# Evaluation

Generated 2026-11-18 by `npm run eval`.

> **Measured on SYNTHETIC recogniser output only.** These numbers test the matching and
> tracking software against simulated transcripts built from verified corpus text. **Real-world
> recognition accuracy on kirtan audio is unmeasured**: no labelled recordings and no singing-tested
> Punjabi ASR were available. Thresholds were tuned on the `tune` split only.

## Measured (synthetic)

| metric | tune (A: clear_close) | eval — all held-out | eval — unseen_raagi | eval — distant_phone | eval — hindi_asr |
|---|---|---|---|---|---|
| clips | 10 | 30 | 10 | 10 | 10 |
| correctIdentification | 100.0% | 93.3% | 100.0% | 80.0% | 100.0% |
| correctAtEnd | 100.0% | 96.7% | 100.0% | 90.0% | 100.0% |
| wrongAutomaticOpens | 0 in 10 clips | 1 in 30 clips | 0 in 10 clips | 1 in 10 clips | 0 in 10 clips |
| unresolved | 0.0% | 3.3% | 0.0% | 10.0% | 0.0% |
| candidateRecall | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| identificationDelayMedianSec | 5.0 | 18.5 | 21.5 | 24.5 | 11.0 |
| lineAccuracyStrict | 78.4% | 70.0% | 72.6% | 62.0% | 75.2% |
| lineAccuracySettled | 97.4% | 86.2% | 89.7% | 76.3% | 92.9% |
| lineAssertedShare | 93.4% | 89.9% | 88.6% | 90.7% | 90.7% |
| instrumentalFalseMoves | 0 | 3 | 0 | 2 | 1 |
| highlightDelayMedianSec | 2.5 | 3.8 | 4.0 | 4.3 | 3.2 |
| highlightDelayP90Sec | 4.8 | 6.8 | 7.6 | 7.2 | 5.9 |
| linesNeverHighlighted | 0.0% | 5.6% | 3.2% | 13.5% | 1.0% |

Corpus searched: Sri Guru Granth Sahib Ji + Vaaran Bhai Gurdas Ji + Ghazals Bhai Nand Lal Ji (full packs).
Clips: 40 (10 shabads × 4 simulated performances; performance A = tuning, B–D held out).

### Clips not correctly auto-opened

- QNL-C: opened X0H, 1 wrong auto-open(s)
- 6U1-C: opened nothing

## Proposed targets (not yet measured on real audio)

| metric | proposed target |
|---|---|
| wrong automatic opens | ≤ 1 per 100 sessions |
| correct identification within 30 s of the first clear line | ≥ 90% |
| candidate recall (true shabad listed) | ≥ 98% |
| line accuracy when the marker is live | ≥ 95% |
| median highlight delay | ≤ 4 s |
| new line asserted during instrumental passages | 0 |

## Metric definitions

- **correctIdentification**: the first shabad opened automatically is the labelled one.
- **correctAtEnd**: the shabad open at the end of the clip is the labelled one.
- **wrongAutomaticOpens**: automatic opens of any other shabad (including later switches).
- **unresolved**: nothing was opened automatically (the listener would pick from the list).
- **candidateRecall**: the labelled shabad appeared in the candidate list or was opened.
- **lineAccuracyStrict**: of windows where the live marker showed a line, the share whose text matches what was being sung at the end of the window.
- **lineAccuracySettled**: the same, excluding the first 3 s after each line change (the transition is reported as highlight delay).
- **lineAssertedShare**: share of sung windows (after opening) in which the marker was live rather than paused or not yet placed.
- **instrumentalFalseMoves**: times the line changed during an instrumental gap.
- **highlightDelay**: seconds from the start of a sung line to the live marker showing it; lines never shown are counted separately.
