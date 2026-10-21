# GitHub release v1.0.0

Can creates this from the GitHub web UI (Releases → Draft a new release) on
launch morning, before the Show HN. Tag `v1.0.0` on the commit that is live.
Title: **MorseForge 1.0**.

`package.json` still says `0.1.0`. Either bump it in a normal commit first, or
leave it: the tag is what people see. Bumping is cleaner.

---

**MorseForge 1.0**

A free Morse code trainer that runs in the browser. It teaches by ear, starts
with you sending, and needs no account.

Live: https://morse.iamcanturk.dev

**Learn**
- The front page is the first lesson: tap the key and you've sent E
- Seven stages by code length: E T · I A N M · S U R W · D K G O · H V F L P J ·
  B X C Y Z Q · 0–9
- Each character is seen, heard and sent, then drilled with everything before
  it
- Recognition, listening and sending tracked separately; a character is only
  mastered with evidence in all three

**Practice and play**
- Practice in three teaching orders, copy practice on code groups, words,
  on-air phrases and callsigns
- A 60-second test whose link carries a seed: same characters, same order,
  same speed for whoever opens it
- A daily of 8 lines, the same for everyone, with a spoiler-free share
- Signal Defender and Morse Runner, games that can't be won by reading the
  screen

**Tools**
- A brass straight key on your keyboard, decoded live, with a telegram share
  card
- Secret messages that play in Morse, carried only in the URL fragment
- Translator, playable alphabet with a page per character, the Signal Tree

**Access**
- Signal setting: Sound, Lamp or Both. Every listening drill works with the
  sound off
- Keyboard-first, screen-reader text for every code, reduced motion honoured
- Installable PWA, works offline

**Under it**
- PARIS-standard timing with ARRL Farnsworth spacing
- Astro 7 static output, React 19 islands only on interactive screens
- 1,936 tests
- No account, no ads, no backend. Cloudflare's cookieless analytics and a
  first-party event counter you can switch off; see /privacy/

**Known gaps:** straight key only (#43), English only (#44). Help wanted on
both.
