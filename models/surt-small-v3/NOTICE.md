# Surt v3 — ONNX int8 conversion

Model: [surindersinghssj/surt-small-v3](https://huggingface.co/surindersinghssj/surt-small-v3),
a Whisper-small fine-tune for Gurbani (sehaj path and kirtan) by its author, licensed Apache-2.0
(inherited from openai/whisper-small). `SOURCE_MODEL_CARD.md` is the original model card.

Modifications: exported to ONNX (optimum, opset 17) and dynamically quantised to int8; the merged
decoder is split into parts under 100 MB for static hosting. Weights are otherwise unchanged.
Reproduce with `tools/model/convert_surt.py` in the Shabad Live repository.
