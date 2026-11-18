# Export the Surt v3 kirtan recogniser (surindersinghssj/surt-small-v3, Apache-2.0,
# a Whisper-small fine-tune on ~420 h kirtan + ~240 h sehaj path) to int8 ONNX for
# transformers.js, and lay the files out for GitHub Pages (parts under 100 MB).
#
#   python -m venv mlenv && mlenv/bin/pip install torch "transformers>=4.44,<4.50" "optimum[onnxruntime]" onnx huggingface_hub
#   mlenv/bin/python tools/model/convert_surt.py models-dist/surt-small-v3
#
# Then `npm run web:deploy` publishes models-dist/ under /models/ on the Pages site.
import os, shutil, sys, json
from optimum.exporters.onnx import main_export
from onnxruntime.quantization import quantize_dynamic, QuantType
from huggingface_hub import list_repo_files, hf_hub_download

REPO = "surindersinghssj/surt-small-v3"
out = sys.argv[1]
raw = out + ".raw"
main_export(REPO, output=raw, task="automatic-speech-recognition-with-past", opset=17)
os.makedirs(out + "/onnx", exist_ok=True)
for f in list_repo_files(REPO):
    if f.endswith((".json", ".txt")) and "/" not in f:
        shutil.copy(hf_hub_download(REPO, f), os.path.join(out, f))
shutil.copy(hf_hub_download(REPO, "README.md"), os.path.join(out, "SOURCE_MODEL_CARD.md"))
quantize_dynamic(f"{raw}/encoder_model.onnx", f"{out}/onnx/encoder_model_quantized.onnx", weight_type=QuantType.QUInt8)
# The merged decoder keeps its weights inside If-subgraphs; they must be quantised too.
quantize_dynamic(f"{raw}/decoder_model_merged.onnx", f"{out}/onnx/decoder_model_merged_quantized.onnx",
                 weight_type=QuantType.QUInt8, extra_options={"EnableSubgraph": True})

# GitHub rejects files over 100 MB: split large files; the app reassembles them.
PART = 90 * 1000 * 1000
parts = {}
for name in os.listdir(out + "/onnx"):
    path = f"{out}/onnx/{name}"
    size = os.path.getsize(path)
    if size <= PART:
        continue
    with open(path, "rb") as fh:
        i = 0
        while chunk := fh.read(PART):
            with open(f"{path}.part{i}", "wb") as o:
                o.write(chunk)
            i += 1
    os.remove(path)
    parts[name] = i
json.dump({"parts": parts}, open(f"{out}/parts.json", "w"), indent=2)
print("done", parts)
