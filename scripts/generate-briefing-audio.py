"""Generate the issue-briefing narration as bundled MP3 clips with Gemini TTS.

Usage (repository root):
    python scripts/generate-briefing-audio.py            # only new or changed scenes
    python scripts/generate-briefing-audio.py --force    # regenerate everything

Needs `pip install lameenc` and GEMINI_API_KEY (environment or backend/.env). The key is used
only here, at build time; the game ships the MP3 files and never calls TTS from the browser.

One clip per scene. The anchor reads the script as written (it is already in news style;
style instructions get read aloud by these models, so none are sent). Lines in “quotes”
summarise opinions from the cited reporting; a second synthetic voice, labelled on screen as
a reporter reenactment, reads them. The player paces captions within a clip by line length.
Free-tier TTS quotas are small and per model, so the script moves to the next model when one
is exhausted and can simply be run again later to fill in the rest.
"""
import base64
import hashlib
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import lameenc

ROOT = Path(__file__).resolve().parents[1]
TOPICS = ROOT / "backend" / "app" / "content" / "topics"
OUT = ROOT / "frontend" / "public" / "audio" / "briefing"
MANIFEST = ROOT / "frontend" / "src" / "data" / "briefingAudio.json"
RULES = ROOT / "frontend" / "src" / "data" / "rulesVideo.json"
MODELS = os.getenv("GEMINI_TTS_MODELS", "gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts,gemini-2.5-pro-preview-tts").split(",")
ANCHOR_VOICE, REPORTER_VOICE, HOST_VOICE = "Charon", "Leda", "Aoede"
RATE = 24000


class QuotaExhausted(Exception):
    pass


class Rejected(Exception):
    pass


def api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "")
    env = ROOT / "backend" / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not key:
        raise SystemExit("GEMINI_API_KEY is not set")
    return key


def speech_config(lines: list[str], voice: str = ANCHOR_VOICE) -> tuple[str, dict]:
    if not any(line.startswith("“") for line in lines):
        return " ".join(lines), {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}
    transcript = "\n".join(f"{'Reporter' if line.startswith('“') else 'Anchor'}: {line.strip('“”')}" for line in lines)
    speakers = [{"speaker": "Anchor", "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": ANCHOR_VOICE}}},
                {"speaker": "Reporter", "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": REPORTER_VOICE}}}]
    return transcript, {"multiSpeakerVoiceConfig": {"speakerVoiceConfigs": speakers}}


def speak(key: str, model: str, text: str, config: dict) -> bytes:
    if "multiSpeakerVoiceConfig" in config and model.startswith("gemini-2.5"):
        # Older models need to be told the transcript is a conversation (the line is not read).
        text = "TTS the following conversation between Anchor and Reporter:\n" + text
    parts = [{"text": text}]
    if "multiSpeakerVoiceConfig" in config and "lite" in model:
        # The lite model wants one part per turn, each tagged with its speaker.
        parts = [{"text": turn.split(": ", 1)[1], "speechMetadata": {"speaker": turn.split(": ", 1)[0]}} for turn in text.splitlines() if ": " in turn]
    payload = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": config}}
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        method="POST",
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.load(response)
            data = base64.b64decode(result["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            if data[:4] != b"RIFF":
                return data  # Raw 16-bit mono PCM at 24 kHz.
            with wave.open(io.BytesIO(data)) as clip:
                if (clip.getnchannels(), clip.getsampwidth(), clip.getframerate()) != (1, 2, RATE):
                    raise SystemExit(f"Unexpected audio format: {clip.getparams()}")
                return clip.readframes(clip.getnframes())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code == 429 and "PerDay" in body:
                raise QuotaExhausted(model) from exc
            if exc.code == 400:
                raise Rejected(body[:200]) from exc
            if exc.code in (429, 500, 503) and attempt < 4:
                time.sleep(min(60, 10 * 2 ** attempt))
                continue
            raise SystemExit(f"TTS failed on {model} ({exc.code}): {body[:300]}")
    raise SystemExit("TTS failed after retries")


def trim(pcm: bytes, threshold: int = 500, pad: float = 0.15) -> bytes:
    """Drop leading/trailing silence so captions and the anchor's mouth stay in step."""
    samples = memoryview(pcm).cast("h")
    loud = [i for i in range(0, len(samples), 240) if max(abs(v) for v in samples[i:i + 240]) > threshold]
    if not loud:
        return pcm
    keep = int(pad * RATE)
    start, end = max(0, loud[0] - keep), min(len(samples), loud[-1] + 240 + keep)
    return pcm[start * 2:end * 2]


def to_mp3(pcm: bytes) -> bytes:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return encoder.encode(pcm) + encoder.flush()


def mouth(pcm: bytes, step: float = 0.08) -> str:
    """Loudness every 80 ms as digits 0-9, so the anchor's mouth can follow the actual speech."""
    samples = memoryview(pcm).cast("h")
    size = int(step * RATE)
    levels = []
    for i in range(0, len(samples), size):
        chunk = samples[i:i + size]
        rms = math.sqrt(sum(v * v for v in chunk) / max(1, len(chunk)))
        levels.append(str(min(9, int(rms / 900))))
    return "".join(levels)


def main() -> None:
    force = "--force" in sys.argv
    key = api_key()
    models = list(MODELS)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    missing = 0
    # Each topic's news briefing (anchor), plus the rules video read by a friendly host ("_rules").
    jobs = [(t["topicId"], t["briefing"]["scenes"], ANCHOR_VOICE) for t in (json.loads(p.read_text(encoding="utf-8")) for p in sorted(TOPICS.glob("*.json")))]
    jobs.append(("_rules", json.loads(RULES.read_text(encoding="utf-8"))["scenes"], HOST_VOICE))
    for topic_id, scenes, voice in jobs:
        clips = {}
        for s, scene in enumerate(scenes):
            lines = scene["lines"]
            digest = hashlib.sha1("\n".join(lines).encode()).hexdigest()[:10]
            name = f"scene{s}-{digest}.mp3"
            previous = manifest.get(topic_id, {}).get(str(s))
            if not force and previous and previous["lines"] == lines and (OUT / topic_id / name).exists():
                clips[str(s)] = previous
                continue
            text, config = speech_config(lines, voice)
            pcm = None
            for model in list(models):
                try:
                    pcm = trim(speak(key, model, text, config))
                    break
                except QuotaExhausted:
                    models.remove(model)
                    print(f"  daily quota used up on {model}")
                except Rejected as exc:
                    print(f"  {model} rejected scene {s}: {exc}")
            if pcm is None:
                missing += 1
                continue
            (OUT / topic_id).mkdir(parents=True, exist_ok=True)
            (OUT / topic_id / name).write_bytes(to_mp3(pcm))
            clips[str(s)] = {"lines": lines, "file": f"/audio/briefing/{topic_id}/{name}", "seconds": round(len(pcm) / 2 / RATE, 2), "mouth": mouth(pcm)}
            print(f"{topic_id} scene {s}: {clips[str(s)]['seconds']}s")
            time.sleep(2)
        manifest[topic_id] = clips
        keep = {Path(c["file"]).name for c in clips.values()}
        for old in (OUT / topic_id).glob("*.mp3") if (OUT / topic_id).exists() else []:
            if old.name not in keep:
                old.unlink()
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Manifest: {MANIFEST.relative_to(ROOT)}" + (f" — {missing} scenes still need audio; run again when the quota resets." if missing else ""))


if __name__ == "__main__":
    main()
