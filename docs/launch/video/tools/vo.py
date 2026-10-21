"""English voice-over for the MorseForge promo, through the Pixel Shorts TTS client.

Reuses `eleven_clip` and `word_starts` from Can's twitter project (same voice
clone, same cache, same key handling: the key is read there and never printed
here). It deliberately skips that project's `pronounce()` step, whose dictionary
is a set of Turkish readings ("AI" -> "eyay") that would wreck English copy.

Usage (Python must be the twitter project's venv; system python3 hangs):
  ~/Documents/Development/twitter/.venv/bin/python docs/launch/video/tools/vo.py docs/launch/video/vo.json

vo.json:
  {"voice_id": "...", "model_id": "eleven_v4", "gap": 0.18,
   "lines": [{"id": "hook", "say": "..."}, ...]}
Writes build/vo_<id>.wav per line, build/voice.wav laid out on the timeline,
and build/timeline.json with each line's start, end and word start times.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

TWITTER = Path(os.environ.get("TWITTER_ROOT", Path.home() / "Documents/Development/twitter"))
sys.path.insert(0, str(TWITTER / "tools"))
from tts import duration, eleven_clip, word_starts  # noqa: E402


def main(spec_path: Path) -> None:
    spec = json.loads(spec_path.read_text())
    build = spec_path.parent / "build"
    build.mkdir(exist_ok=True)
    cfg = {"voice_id": spec["voice_id"], "model_id": spec.get("model_id", "eleven_v4")}
    if spec.get("settings"):
        cfg["settings"] = spec["settings"]

    lines = spec["lines"]
    t = float(spec.get("lead", 0.0))
    timeline, parts = [], []
    for i, line in enumerate(lines):
        mp3 = build / f"vo_{line['id']}.mp3"
        wav = build / f"vo_{line['id']}.wav"
        speak = lambda l: l.get("speak", l["say"])  # "speak" overrides what the voice reads
        prev = speak(lines[i - 1]) if i else ""
        nxt = speak(lines[i + 1]) if i + 1 < len(lines) else ""
        align = eleven_clip(speak(line), cfg, prev, nxt, mp3)
        words, first, last = word_starts(align)
        a, b = max(0.0, first - 0.03), last + 0.08
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-af",
                        f"atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS", "-ar", "48000", str(wav)], check=True)
        d = duration(wav)
        start = float(line.get("at", t))
        timeline.append({"id": line["id"], "say": line["say"], "start": round(start, 3),
                         "end": round(start + d, 3), "words": [round(w - a, 3) for w in words]})
        parts.append((wav, start))
        t = start + d + float(line.get("gap", spec.get("gap", 0.18)))

    total = float(spec.get("duration", t + 1.0))
    inputs, filters = [], []
    for i, (clip, start) in enumerate(parts):
        inputs += ["-i", str(clip)]
        ms = int(start * 1000)
        filters.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(parts)))
    filters.append(f"{mix}amix=inputs={len(parts)}:normalize=0,apad,atrim=0:{total:.3f}[out]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters),
                    "-map", "[out]", "-ar", "48000", "-ac", "2", str(build / "voice.wav")], check=True)
    (build / "timeline.json").write_text(json.dumps({"duration": total, "lines": timeline}, indent=2))
    for seg in timeline:
        print(f"{seg['id']:>10} {seg['start']:6.2f} -> {seg['end']:6.2f}  {seg['say']}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
