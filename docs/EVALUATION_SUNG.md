# Evaluation

Generated 2026-11-18 by `npm run eval`.

> **Measured on SYNTHETIC recogniser output only.** These numbers test the matching and
> tracking software against simulated transcripts built from verified corpus text. **Real-world
> recognition accuracy on kirtan audio is unmeasured**: no labelled recordings and no singing-tested
> Punjabi ASR were available. Thresholds were tuned on the `tune` split only.

## Measured (synthetic)

| metric | tune — sung_browser | tune — sung_kirtan_model | eval — all held-out | eval — sung_browser | eval — sung_kirtan_model |
|---|---|---|---|---|---|
| clips | 10 | 10 | 20 | 10 | 10 |
| correctIdentification | 50.0% | 100.0% | 75.0% | 50.0% | 100.0% |
| correctAtEnd | 30.0% | 100.0% | 70.0% | 50.0% | 90.0% |
| wrongAutomaticOpens | 0 in 10 clips | 0 in 10 clips | 2 in 20 clips | 2 in 10 clips | 0 in 10 clips |
| unresolved | 50.0% | 0.0% | 20.0% | 40.0% | 0.0% |
| candidateRecall | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |
| identificationDelayMedianSec | 88.0 | 61.0 | 72.0 | 116.0 | 61.0 |
| lineAccuracyStrict | 60.2% | 75.3% | 71.4% | 65.8% | 73.4% |
| lineAccuracySettled | 64.6% | 81.4% | 77.3% | 69.9% | 79.9% |
| lineAssertedShare | 90.8% | 91.0% | 90.5% | 89.8% | 90.8% |
| instrumentalFalseMoves | 0 | 0 | 0 | 0 | 0 |
| highlightDelayMedianSec | 12.5 | 8.6 | 8.5 | 10.0 | 8.4 |
| highlightDelayP90Sec | 23.1 | 15.6 | 17.5 | 21.6 | 14.7 |
| linesNeverHighlighted | 50.0% | 2.2% | 14.6% | 43.6% | 3.1% |

Corpus searched: Sri Guru Granth Sahib Ji + Vaaran Bhai Gurdas Ji + Ghazals Bhai Nand Lal Ji (full packs).
Clips: 40 (10 shabads × 4 simulated performances). Groups starting "tune" were used to set thresholds; "eval" groups were held out. Windows: as stored in the clips.

### Clips not correctly auto-opened

- MRB-B: opened nothing
- QNL-A: opened nothing
- QNL-B: opened nothing
- 5BC-A: opened nothing
- 5BC-B: opened nothing
- KF2-B: opened nothing
- NK7-A: opened nothing
- BGL-A: opened nothing
- 6U1-A: opened nothing
- 1SS-B: opened 27A, 2 wrong auto-open(s)

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
