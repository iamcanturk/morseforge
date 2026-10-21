# Assets

Everything here is a real state of the live site (2026-10-21), captured by
driving headless Chrome through the site's own key handler: the hero and the
telegraph were actually keyed, the message link is a real `/message/` link.
Nothing is mocked up and no number is invented. Regenerate with
[`tools/`](tools/) (see the end of this page).

## Screenshots: `docs/launch/assets/`

Three sizes: **1200×630** (X/OG/LinkedIn/HN discussion), **1080×1350** (4:5,
phone-first feeds: X, Instagram, LinkedIn mobile), **1270×760** (Product Hunt
gallery).

| File stem | What it shows | 1200×630 | 1080×1350 | 1270×760 |
| --- | --- | :-: | :-: | :-: |
| `01-hero-first-signal` | Landing page right after the first tap: E, SIGNAL DETECTED, +10 XP, achievement | ✓ | ✓ | ✓ |
| `02-message-incoming` | A secret message as the recipient sees it, mid-playback (RECEIVING 2 OF 18) | ✓ | ✓ | ✓ |
| `02-message-incoming-light` | The same, light theme (telegram form) | ✓ | | |
| `03-telegraph-sos` | Telegraph after keying SOS by hand: SOS · PRIORITY stamp, brass key | ✓ | ✓ | ✓ |
| `03-telegram-card-sos` | The share card the telegraph draws on its own canvas (extracted from the page) | ✓ | | |
| `04-challenge-link` | A seeded challenge link opened by a friend: SAME RUN, 60 s · 20 WPM · 14 letters (no score claimed) | ✓ | ✓ | ✓ |
| `05-daily-brief` | Today's daily (No. 62) before starting: 15 WPM spaced to 7, pass 80% | ✓ | | ✓ |
| `06-signal-tree` | The Signal Tree | ✓ | | ✓ |
| `07-lesson-stage-1` | Lesson stage 1 of 7: See / Hear / Send, E on CRT glass | ✓ | | ✓ |
| `ph-thumbnail-240.png` | Product Hunt thumbnail (Split M on the dark tile, from `public/icons/icon-512.png`) | | | |

Reused from the repo:
- `public/og/default.png` (1200×630): the site's link card. X and LinkedIn
  render it automatically from the URL.
- `public/og/github-social.png` (1280×640): already the repo's social preview.
- `docs/screens/*.webp`: README screenshots. `signal-lamp.webp` is used in the
  video for Lamp mode.
- `docs/demo.gif`: the Signal Tree animation. Fine as a reply GIF on X.

## Assets only Can can make 👤

These need a real person's real result. Don't fabricate them.

| What | Why | How |
| --- | --- | --- |
| **Your daily share** | The spoiler-free squares are the most shareable artefact the site makes, and a made-up one would be a fake result | Play `/daily/` on launch morning, tap Share, screenshot the text (or post the text itself) |
| **Your challenge result + link** | "Beat my score" only works with a real score | Play `/challenge/`, then **Challenge a friend**. Post your real link in the X thread or as a reply |
| **A 10-second phone screen recording** of tapping the hero key | Shows real touch on a real phone, with sound | iOS: Control Center → Screen Recording (hold for mic off). Android: Quick Settings → Screen record |
| **Your face/voice** (optional) | A 20-second selfie video telling the sailing story converts better than any edit | Only if you want to. The promo already uses your voice clone |

## Video: `docs/launch/video/renders/`

Six renders (H.264 + AAC, yuv420p, 30 fps, −14 LUFS). They're **not in git**
(too large, rebuilt from source). Copies for posting are in
`~/Movies/MorseForge-launch/`.

| File | Length | Use |
| --- | --- | --- |
| `morseforge-promo-short-9x16-en.mp4` | 0:57 | X (English thread, tweet 1), Reels/Shorts in English |
| `morseforge-promo-short-16x9-en.mp4` | 0:58 | LinkedIn, X if you prefer landscape |
| `morseforge-promo-full-16x9-en.mp4` | 1:44 | YouTube (unlisted) → Product Hunt gallery, README link |
| `morseforge-promo-full-9x16-en.mp4` | 1:43 | YouTube Shorts is capped at 3 min; also TikTok |
| `morseforge-tanitim-kisa-9x16-tr.mp4` | 0:59 | X (Turkish thread) |
| `morseforge-tanitim-uzun-9x16-tr.mp4` | 1:45 | Instagram Reels |

Script and approvals: [video/script.md](video/script.md). How it's built:
[video/README.md](video/README.md).

## By channel

| Channel | Media |
| --- | --- |
| Show HN | None. HN is text only; the link is the demo |
| X (EN story thread) | short 9:16 EN video; `01-hero-first-signal-1080x1350`, `03-telegraph-sos-1080x1350`, `04-challenge-link-1080x1350`; your daily share |
| X (TR thread) | short 9:16 TR video; the same three 1080×1350 images |
| Instagram | long 9:16 TR video (Reels); optionally a carousel of the three 1080×1350 images |
| LinkedIn | short 16:9 EN video, or `01-hero-first-signal-1200x630` |
| Reddit | Mostly none: link posts unfurl `og/default.png`. In a text post on r/morsecode or r/amateurradio, one image (`01-hero-first-signal-1200x630`) is enough |
| Product Hunt | 8 gallery images at 1270×760 + the YouTube link + `ph-thumbnail-240.png` (see [product-hunt.md](product-hunt.md)) |
| Ham forums / club e-mails | No media; one link |
| Newsletters | `01-hero-first-signal-1200x630` if they ask for an image |

## Regenerating

From `docs/launch/tools/`, with Node on PATH and Chrome installed (set
`SCRATCH` to a temp folder for the Chrome profile):

```bash
node docs/launch/tools/assets.mjs docs/launch/assets
```

The video's recordings and stills come from `record.mjs` and `stills.mjs` in
the same folder; see [video/README.md](video/README.md).
