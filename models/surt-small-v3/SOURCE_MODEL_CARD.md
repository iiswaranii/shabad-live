---
license: apache-2.0
language:
- pa
tags:
- whisper
- automatic-speech-recognition
- asr
- gurbani
- gurmukhi
- punjabi
- sehaj-path
- kirtan
library_name: transformers
pipeline_tag: automatic-speech-recognition
base_model: openai/whisper-small
datasets:
- surindersinghssj/gurbani-sehajpath-yt-captions-canonical
- surindersinghssj/gurbani-sehajpath
- surindersinghssj/gurbani-kirtan-yt-captions-300h-canonical
metrics:
- wer
- cer
model-index:
- name: surt-small-v3
  results:
  - task:
      type: automatic-speech-recognition
      name: Sehaj Path Recitation (held-out eval)
    dataset:
      name: gurbani-sehajpath-yt-captions-eval-canonical
      type: surindersinghssj/gurbani-sehajpath-yt-captions-eval-canonical
      split: train
    metrics:
    - type: wer
      value: 16.31
      name: WER (step 12000, final)
    - type: cer
      value: 5.25
      name: CER (step 12000, final)
    - type: wer
      value: 15.84
      name: Best WER (step 11000)
    - type: cer
      value: 5.15
      name: Best CER (step 11000)
  - task:
      type: automatic-speech-recognition
      name: Kirtan (held-out eval)
    dataset:
      name: gurbani-kirtan-yt-captions-eval-canonical
      type: surindersinghssj/gurbani-kirtan-yt-captions-eval-canonical
      split: train
    metrics:
    - type: wer
      value: 54.80
      name: WER (step 12000, final)
    - type: cer
      value: 28.00
      name: CER (step 12000, final)
---

# Surt v3 — Whisper-small fine-tune for Gurbani (Sehaj Path + Kirtan)

**Surt v3** is a fine-tuned [`openai/whisper-small`](https://huggingface.co/openai/whisper-small) for automatic speech recognition of **Gurbani in Gurmukhi script** — covering both **sehaj-path (calm recitation)** and **kirtan (sung/musical)** traditions. Trained on ~660h of clean, canonicalized Gurbani audio.

This is the **final-step (step 12000) model**. For the step-11000 best-sehaj-WER checkpoint, see [`surindersinghssj/surt-small-v3-training`](https://huggingface.co/surindersinghssj/surt-small-v3-training).

## Headline results

Evaluated on the matched canonical eval sets:

| Domain | Dataset | WER | CER |
|---|---|---|---|
| Sehaj | [`gurbani-sehajpath-yt-captions-eval-canonical`](https://huggingface.co/datasets/surindersinghssj/gurbani-sehajpath-yt-captions-eval-canonical) | **16.31** | **5.25** |
| Kirtan | [`gurbani-kirtan-yt-captions-eval-canonical`](https://huggingface.co/datasets/surindersinghssj/gurbani-kirtan-yt-captions-eval-canonical) | **54.80** | **28.00** |

Best step-11000 checkpoint hits **sehaj WER 15.84 / CER 5.15** — available on the training repo (see below).

## Highlights

- **Cold start from base `openai/whisper-small`** — no warm-start, no inherited v1/v2 bias
- **Sehaj WER 16.31%** — major improvement over Surt v2's ~24% (data-leak-adjusted)
- **Kirtan WER 54.80%** — comparable to v2's ~55% but v3 trained on 15× more kirtan, much better CER (28.00 vs v2's higher)
- **660h of canonicalized Gurbani** (sehaj + kirtan), all labels aligned to Sri Guru Granth Sahib Ji
- **Gurmukhi output** (ਗੁਰਮੁਖੀ) — ॥ verse markers stripped from labels during training
- **Language tag:** Punjabi (`pa`), `task=transcribe`

## Quick start

```python
from transformers import pipeline

pipe = pipeline(
    "automatic-speech-recognition",
    model="surindersinghssj/surt-small-v3",
    chunk_length_s=30,
)
result = pipe("path/to/audio.wav", generate_kwargs={"language": "punjabi", "task": "transcribe"})
print(result["text"])
```

Or with direct model / processor access:

```python
from transformers import WhisperForConditionalGeneration, WhisperProcessor

processor = WhisperProcessor.from_pretrained("surindersinghssj/surt-small-v3", language="punjabi", task="transcribe")
model = WhisperForConditionalGeneration.from_pretrained("surindersinghssj/surt-small-v3")
model.generation_config.language = "punjabi"
model.generation_config.task = "transcribe"
model.generation_config.forced_decoder_ids = None
```

**Live demo:** [Gradio Space](https://huggingface.co/spaces/surindersinghssj/surt-v3-gurbani-asr).

## Training data

| Source | Repo | Hours | Role |
|---|---|---|---|
| New sehaj (publicly available recordings with aligned transcripts) | [`gurbani-sehajpath-yt-captions-canonical`](https://huggingface.co/datasets/surindersinghssj/gurbani-sehajpath-yt-captions-canonical) | ~160h | Primary sehaj stream |
| Old sehaj (studio) | [`gurbani-sehajpath`](https://huggingface.co/datasets/surindersinghssj/gurbani-sehajpath) | ~66h | Extra sehaj stream |
| Kirtan (publicly available recordings with aligned transcripts) | [`gurbani-kirtan-yt-captions-300h-canonical`](https://huggingface.co/datasets/surindersinghssj/gurbani-kirtan-yt-captions-300h-canonical) | ~420h | Aux kirtan stream |

Training mix: **~220h sehaj** (36%) **+ ~420h kirtan** (64%) via oversampling aux at `AUX_TRAIN_PROBABILITY=0.64`. Text column normalized to `final_text` on all canonical sources. Old sehaj's `gurmukhi_text` column renamed at load.

## Evaluation

### Sehaj trajectory

| Step | WER | CER |
|---|---|---|
| 500 | 27.57 | 8.30 |
| 2000 | 26.17 | 8.20 |
| 5000 | 24.13 | 7.57 |
| 7500 | 16.97 | 5.54 |
| 9000 | 16.17 | 5.17 |
| **11000** | **15.84** | **5.15** |
| 12000 (final) | 16.31 | 5.25 |

### Kirtan (on the matched `gurbani-kirtan-yt-captions-eval-canonical` set, `train` split, 573 rows)

| Step | WER | CER |
|---|---|---|
| 7500 | 57.36 | 29.66 |
| 9000 | 54.92 | 28.27 |
| **12000 (final)** | **54.80** | **28.00** |

**Note on the "pure" kirtan eval:** an earlier eval used during training (`gurbani-kirtan-eval-pure-canonical`, `eval` split) showed inflated kirtan WER in the 119–135% range. That was a **label-format mismatch** — the "pure" eval references include extra markup the model was trained to strip. The numbers above use the **matched** canonical eval set.

## Training procedure

- **Framework:** 🤗 Transformers `Seq2SeqTrainer` (custom `SurtTrainer` with discriminative LR)
- **Precision:** bf16
- **Attention:** SDPA / Flash Attention 2 when installed
- **Hardware:** 1× NVIDIA A40 (48 GB VRAM)
- **Wall-clock:** ~6h 29m

### Hyperparameters

| Knob | Value |
|---|---|
| `max_steps` | 12000 |
| Per-device batch | 32 |
| Grad accumulation | 2 |
| Effective batch | 64 |
| Encoder LR | 5e-5 |
| Decoder LR | 3e-5 |
| LR scheduler | cosine |
| Warmup steps | 900 (~7.5%) |
| Weight decay | 0.01 |
| Generation max length | 448 tokens |
| Label-length filter | drop rows with >448 tokens |

### Data augmentation (raw waveform, pre-feature-extraction)

- Gaussian noise @ p=0.4
- Room reverb @ p=0.3
- Time stretch 0.9–1.1 @ p=0.1
- **No pitch shift** (kirtan is tonal — pitch distortion corrupts raga tonal center)

## Intended use

- Transcription of **sehaj-path recitation** recordings (best-performing domain, WER 16.31%)
- Transcription of **Gurbani kirtan** audio (WER 54.80%, CER 28.00% — sung/musical context)
- Input audio: 16 kHz mono, ≤30 seconds per chunk (Whisper's native window; auto-chunked in the Gradio demo)

## Out-of-scope / limitations

- Not trained on **non-Gurbani Punjabi speech** — expect degradation on everyday Punjabi conversation
- Not trained on **English / Hindi / other languages** — base Whisper multilingual ability is mostly lost after full fine-tune
- **Speaker / mic / recording bias** — training data skews toward publicly available web-sourced recordings with aligned transcripts; live Darbar Sahib PA reverb or noisy field recordings may WER worse
- **Katha (spoken commentary)** is not in the training distribution — quality will vary

## How this compares to prior Surt versions

| Version | Base | Training data | Sehaj WER | Kirtan WER |
|---|---|---|---|---|
| Surt v1 | whisper-small | 66h sehaj only | ~24% (leak-inflated; true ~40–50%) | — (hallucinates) |
| Surt v2 | Surt v1 | v1 + 28h noisy kirtan v2 | ~regressed | ~55% (28h kirtan) |
| **Surt v3** | **whisper-small (cold start)** | **660h canonical mixed** | **16.31% (final) / 15.84% (best)** | **54.80% (final)** |

Surt v3 matches or slightly improves on v2's kirtan WER while using **15× more kirtan data** and achieving a **much cleaner, script-aware sehaj model** — all from a cold-start base, eliminating leak concerns.

## License

Apache 2.0, inheriting from `openai/whisper-small`.

## Citation

```
@misc{surt-v3-2026,
  title        = {Surt v3: Whisper-small fine-tune for Gurbani ASR},
  author       = {Singh, Surinder},
  year         = {2026},
  howpublished = {\url{https://huggingface.co/surindersinghssj/surt-small-v3}}
}
```
