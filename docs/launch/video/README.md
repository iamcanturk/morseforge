# Promo video: how it's built

**Script and approvals:** [script.md](script.md). Can approved v3 on
2026-10-21, and the English voice test the same day.

## Pipeline

1. **Voice:** `tools/vo.py` voices `en/vo.json` and `tr/vo.json` with Can's
   ElevenLabs clone (`eleven_v4`). It reuses the Pixel Shorts TTS client in
   `~/Documents/Development/twitter` (same key handling, same cache) but skips
   that project's Turkish pronunciation dictionary. Output: `<lang>/build/`.
   Run it with the twitter project's venv Python; system `python3` hangs.
2. **Music:** `tools/music.py` writes one ElevenLabs Music bed,
   `assets/music.mp3` (80 s, instrumental).
3. **Footage:** real recordings and stills of the live site.
   `../tools/record.mjs` drives headless Chrome over CDP and records the
   screencast plus the exact key times: hero E-T-A; telegraph SOS in the
   telegraph's Manual mode (Ctrl finishes each letter, New word closes the word),
   because headless timer jitter made the automatic letter gaps unreliable;
   message playback. `../tools/stills.mjs` captures lesson, tree,
   daily, challenge, both games mid-play. Lamp mode uses
   `docs/screens/signal-lamp.webp`.
4. **Edit:** `tools/build.mjs` makes one HyperFrames project per variant in
   `hf/<variant>/`:
   - **Timeline:** voice clips at 1.1× tempo; the recordings are aligned so the
     E tap lands on "Tap once" and SOS follows "Try sending SOS".
   - **Audio mix:** voice, plus 600 Hz CW tones generated at the exact frames
     the recordings show the key going down, plus telegraph clacks; the music
     is side-chain ducked under the voice; two-pass loudness to −14 LUFS /
     −1.5 dBTP.
   - **Composition:** `index.html` (GSAP), with word-timed captions.
5. **Render:** from inside `hf/<variant>/`:
   `npx hyperframes render --quality delivery --fps 30 --output ../../renders/<name>.mp4`.
   About 5.5 min per minute of video.

Variants: `{en,tr}-{full,short}-{tall,wide}` (the TR wide versions aren't
built). The short cut uses lines s01, s02, s05, s06, s09, s12, s15 and s16 of
the same voice-over, so it cost no extra credits.

## Credits used (ElevenLabs, 2026-10-21)

- Voice test: 56 characters.
- EN voice-over: 1,453 characters. TR voice-over: 1,377.
- Music: one 80-second track (about 1,650 credits by the Pixel Shorts
  estimate).

## Rebuild

```bash
export PATH="$HOME/.nvm/versions/node/v26.11.1/bin:$PATH"
cd docs/launch/video/hf && npm install          # HyperFrames 0.8.184
cd .. && node tools/build.mjs                   # all six variants
cd hf/en-short-tall && npx hyperframes snapshot --at 1,9,23,28,37,41,47,53 -o snaps   # review frames
```

`hf/*/`, `renders/`, `<lang>/build/`, the music and the recordings are
gitignored. They're generated or paid-for media.

## Style

The look is MorseForge's own design system (`src/styles/palette.ts`): walnut
and void backgrounds, brass bezels, telegram paper, phosphor green on CRT glass
with scanlines, one amber accent, Space Grotesk + JetBrains Mono from
`public/fonts`, and the Split M drawn as two dashes because M is `--`.
Technique notes taken from the reference repos:

- lemo-opuscar: reading-time floors, every visible action gets a sound, the
  CRT phosphor recipe, −14 LUFS mastering.
- mg-styles-15: overshoot easing on entrances, contact-sheet review rounds.
- ClaudeAnimationBase: one read at a time, about 1 s per read.
- pdoom-video: cuts land on the beat (here, on Morse gaps), palette
  discipline.
