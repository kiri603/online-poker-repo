"""Align 小桃's published recordings to their exact tutorial text for timed subtitles.

Run in a separate qwen-asr environment; its Transformers version differs from qwen-tts.
No speech recognition or external transcription service is used.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import unicodedata

from generate_xiaotao_audios import VOICE_DIR, OUTPUT, read_lines, write_catalog, write_listening_page

MODEL_ID = "Qwen/Qwen3-ForcedAligner-0.6B"


def kept(character):
    return character == "'" or unicodedata.category(character).startswith(("L", "N"))


def project_cues(text, items, duration):
    positions = [index for index, character in enumerate(text) if kept(character)]
    clean = "".join(text[index] for index in positions)
    tokens = "".join(item.text for item in items)
    if tokens != clean or not positions:
        raise RuntimeError("The forced alignment does not cover the full tutorial text.")
    cues = []
    cursor, previous_time = 0, 0.0
    anomalies = 0
    for item in items:
        cursor += len(item.text)
        # Include punctuation and spaces after the spoken unit.
        end = positions[cursor] if cursor < len(positions) else len(text)
        start = float(item.start_time)
        finish = float(item.end_time)
        if not (0 <= start <= duration and start <= finish <= duration + .1):
            anomalies += 1
        if start < previous_time or start > duration:
            anomalies += 1
        start = round(min(duration, max(previous_time, start, 0)), 3)
        cues.append({"time": start, "end": end})
        previous_time = start
    # A collapsed alignment must not silently become a published timing track.
    if anomalies > max(2, len(items) // 20) or cues[-1]["time"] < duration * .6:
        raise RuntimeError("The forced alignment contains too many invalid timestamps.")
    return cues


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    manifest_path = VOICE_DIR / "generated-audios.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    lines = read_lines()
    pending = []
    for line in lines:
        clip = manifest["clips"][line["id"]]
        audio_hash = hashlib.sha256((OUTPUT / clip["file"]).read_bytes()).hexdigest()
        text_hash = hashlib.sha256(line["text"].encode("utf-8")).hexdigest()
        if clip["text"] != line["text"] or clip["sha256"] != audio_hash:
            raise RuntimeError("Recording does not match the current tutorial: " + line["id"])
        alignment = clip.get("subtitle_alignment", {})
        if (not clip.get("subtitle_cues") or alignment.get("audio_sha256") != audio_hash
            or alignment.get("text_sha256") != text_hash or alignment.get("model") != MODEL_ID):
            pending.append(line)
    if args.limit:
        pending = pending[:args.limit]
    if not pending:
        write_catalog(lines, manifest["clips"])
        print("All subtitle tracks are current.")
        return
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_asr import Qwen3ForcedAligner
    torch.set_num_threads(4)
    print(json.dumps({"state": "loading_aligner", "clips": len(pending)}), flush=True)
    model = Qwen3ForcedAligner.from_pretrained(args.model, device_map=args.device,
        dtype=torch.bfloat16 if args.device.startswith("cuda") else torch.float32,
        attn_implementation="sdpa", low_cpu_mem_usage=True)
    provenance = Path(args.model) / "download-provenance.json"
    revision = json.loads(provenance.read_text(encoding="utf-8"))["revision"] if provenance.is_file() else None
    for index, line in enumerate(pending, 1):
        started = time.monotonic()
        clip = manifest["clips"][line["id"]]
        audio, sr = sf.read(OUTPUT / clip["file"], dtype="float32")
        if audio.ndim != 1 or not np.isfinite(audio).all():
            raise RuntimeError("Invalid recording: " + line["id"])
        duration = len(audio) / sr
        # Preserve punctuation as token boundaries so e.g. 5、6、7 do not merge into 567.
        aligned_text = "".join(character if kept(character) else " " for character in line["text"])
        result = model.align(audio=(audio, sr), text=aligned_text, language="Chinese")[0]
        cues = project_cues(line["text"], result.items, duration)
        clip["subtitle_cues"] = cues
        clip["subtitle_alignment"] = {"model": MODEL_ID, "revision": revision,
            "audio_sha256": clip["sha256"],
            "text_sha256": hashlib.sha256(line["text"].encode("utf-8")).hexdigest()}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"state": "aligned", "id": line["id"], "index": index, "total": len(pending),
            "cues": len(cues), "elapsed_seconds": round(time.monotonic() - started, 1)}), flush=True)
    write_catalog(lines, manifest["clips"])
    write_listening_page(lines, manifest["clips"])
    print(json.dumps({"state": "finished", "aligned_clips": len(pending)}), flush=True)


if __name__ == "__main__":
    main()
