"""Generate bundled Korean narration clips with Pocket-TTS (see AUDIO_CREDITS.md).

Usage (repository root):
    python scripts/generate-narration.py briefing [chapter-id ...]
    python scripts/generate-narration.py line "문장" file.mp3

Needs `pip install pocket-tts lameenc numpy`. Each line is synthesized sentence by sentence
with the Voice-Zero male prompt, joined with short pauses, encoded to MP3 and registered in
frontend/src/data/narration.json under its exact text, which is how useGameAudio finds it.
Clip lengths are written back to frontend/src/data/briefing.json.
"""
import json
import re
import sys
from pathlib import Path

import lameenc
import numpy as np
from huggingface_hub import hf_hub_download
from pocket_tts import TTSModel

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "frontend" / "public" / "audio" / "narration"
INDEX = ROOT / "frontend" / "src" / "data" / "narration.json"
SCRIPT = ROOT / "frontend" / "src" / "data" / "briefing.json"
CONFIG = "hf://seastar105/pocket-tts-korean-100m/korean.yaml@d5418f368ed97bc982ab80c5b639fe28f280636b"
PAUSE_SECONDS = 0.32


def sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]


def to_mp3(audio: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return encoder.encode(pcm.tobytes()) + encoder.flush()


def synthesize(model, voice, text: str) -> tuple[bytes, float]:
    rate = model.sample_rate
    pause = np.zeros(int(rate * PAUSE_SECONDS), dtype=np.float32)
    parts = []
    for sentence in sentences(text):
        audio = model.generate_audio(voice, sentence).detach().cpu().numpy().reshape(-1).astype(np.float32)
        parts += [audio, pause]
    clip = np.concatenate(parts[:-1])
    peak = float(np.max(np.abs(clip))) or 1.0
    clip = clip * (0.89 / peak)
    return to_mp3(clip, rate), round(len(clip) / rate, 1)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode not in ("briefing", "line") or (mode == "line" and len(sys.argv) != 4):
        raise SystemExit(
            "usage: python scripts/generate-narration.py briefing [chapter-id ...]\n"
            "       python scripts/generate-narration.py line \"문장\" file.mp3"
        )
    model = TTSModel.load_model(config=CONFIG)
    prompt = hf_hub_download("kyutai/tts-voices", "voice-zero/bill_boerst.wav")
    voice = model.get_state_for_audio_prompt(prompt)
    index = json.loads(INDEX.read_text(encoding="utf-8"))

    if mode == "line":
        text, filename = sys.argv[2], sys.argv[3]
        data, seconds = synthesize(model, voice, text)
        (OUT_DIR / filename).write_bytes(data)
        index[text] = filename
        print(f"{filename}: {seconds}s")
    else:
        only = set(sys.argv[2:])
        steps = json.loads(SCRIPT.read_text(encoding="utf-8"))
        for step in steps:
            if only and step["id"] not in only:
                continue
            filename = f"briefing_{step['id']}.mp3"
            # Drop the index entry of a line whose wording changed.
            for old in [k for k, v in index.items() if v == filename]:
                del index[old]
            data, step["seconds"] = synthesize(model, voice, step["voice"])
            (OUT_DIR / filename).write_bytes(data)
            index[step["voice"]] = filename
            print(f"{filename}: {step['seconds']}s")
        # The briefing UI sizes its progress bar from these clip lengths.
        SCRIPT.write_text(json.dumps(steps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
