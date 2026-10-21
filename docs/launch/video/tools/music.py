"""One ElevenLabs Music bed for the MorseForge promo (all three versions).

Same request as the Pixel Shorts `tools/music.py`, with the key read by that
project's `api_key()` (never printed here), but the prompt and the output path
are this video's. Costs roughly 1,650 credits; skips if the file exists.

Usage:
  ~/Documents/Development/twitter/.venv/bin/python docs/launch/video/tools/music.py docs/launch/video/assets/music.mp3
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

TWITTER = Path(os.environ.get("TWITTER_ROOT", Path.home() / "Documents/Development/twitter"))
sys.path.insert(0, str(TWITTER / "tools"))
from tts import api_key  # noqa: E402

PROMPT = (
    "Instrumental, warm analog synth and soft electric piano, light tape saturation, gentle pulse at 92 BPM, "
    "starts sparse and a little wistful, opens up and becomes hopeful halfway through, a quiet sea-and-telegraph-office "
    "nostalgia, no vocals, uncluttered midrange to sit under a voice-over, clean ending."
)
LENGTH_MS = 80_000


def main(out: Path) -> None:
    if out.exists():
        print(f"exists: {out}")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    body = {"prompt": PROMPT, "music_length_ms": LENGTH_MS, "model_id": "music_v2_5", "force_instrumental": True}
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=400) as r:
            out.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code}: {e.read().decode()[:400]}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
