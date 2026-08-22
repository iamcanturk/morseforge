<div align="center">

<a href="https://morse.iamcanturk.dev">
  <img src="public/og/github-social.png" alt="MorseForge — Learn Morse. Build the Signal." width="820">
</a>

### Learn Morse. Build the Signal.

A free Morse code trainer that runs entirely in your browser — real CW audio, a
keyboard straight key, and a signal tree that lights up as you master each
character.

**[Open it →](https://morse.iamcanturk.dev)** &nbsp;·&nbsp;
[Learn in 7 days](https://morse.iamcanturk.dev/learn-morse-code-in-7-days/) &nbsp;·&nbsp;
[60-second challenge](https://morse.iamcanturk.dev/challenge/) &nbsp;·&nbsp;
[Send something](https://morse.iamcanturk.dev/telegraph/)

[![Live](https://img.shields.io/badge/live-morse.iamcanturk.dev-00E88F?style=flat-square)](https://morse.iamcanturk.dev)
[![Tests](https://img.shields.io/badge/tests-661%20passing-00E88F?style=flat-square)](#testing)
[![License](https://img.shields.io/badge/license-MIT-8B98A5?style=flat-square)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-7-8B98A5?style=flat-square)](https://astro.build)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-00E88F?style=flat-square)](CONTRIBUTING.md)

</div>

---

## What it is

Most Morse code sites are a translator with an alphabet chart bolted on.
MorseForge is a trainer: you learn the code in the order it is actually
structured, you hear it as real CW tones, and you send it back with your own
keyboard.

No account. No ads. No server — your progress never leaves your device.

|                                                                                    |                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **[Learn it in 7 days](https://morse.iamcanturk.dev/learn-morse-code-in-7-days/)** | Two characters on day one, all 26 letters and 10 digits by day seven                        |
| **[The tree](https://morse.iamcanturk.dev/tree/)**                                 | The real binary structure of Morse, drawn as a circuit. Pick a node to hear it and drill it |
| **[Telegraph](https://morse.iamcanturk.dev/telegraph/)**                           | Your keyboard is the key. Tap for a dot, hold for a dash, decoded live                      |
| **[Copy practice](https://morse.iamcanturk.dev/copy/)**                            | Whole lines — code groups, words, on-air phrases, callsigns — graded character by character |
| **[Daily challenge](https://morse.iamcanturk.dev/daily/)**                         | Eight lines a day, generated from the date so everyone gets the same one, with no backend   |
| **[Games](https://morse.iamcanturk.dev/games/signal-defender/)**                   | Signal Defender for copying under pressure, Morse Runner for sending under it               |
| **[Translator](https://morse.iamcanturk.dev/morse-code-translator/)**              | Text ↔ Morse, with audio and a signal lamp at 5–40 WPM                                      |
| **[Alphabet](https://morse.iamcanturk.dev/morse-code-alphabet/)**                  | Every character per ITU-R M.1677-1, click to hear                                           |
| **[Words](https://morse.iamcanturk.dev/words/)**                                   | 22 words and phrases, each playable and explained                                           |

---

<div align="center">

<img src="docs/demo.gif" alt="The Signal Tree lighting up as M O R S E is sent, one character at a time" width="760">

<sub>The Signal Tree, at real Morse timing. Every character sits at the address its own code spells out.</sub>

</div>

## Try it in thirty seconds

No signup, nothing to install, and it works on a phone.

1. **[Hear one character](https://morse.iamcanturk.dev/learn/)** — the guided
   lesson shows it, plays it, then asks you to send it back.
2. **[Send your own](https://morse.iamcanturk.dev/telegraph/)** — hold the space
   bar. Tap for a dot, hold for a dash. It decodes as you go.
3. **[Take the 60-second challenge](https://morse.iamcanturk.dev/challenge/)** —
   and send the link to someone, with your score baked into it.

## Why it's built this way

A few decisions that are load-bearing, and would look arbitrary without the
reasoning.

**Characters are taught by code length, not alphabetically.** Morse is a prefix
tree — a dot branches left, a dash branches right — so the seven-day plan walks
one layer per day. That is why day one is E and T, and why Q and Z come last.

**Three skills are tracked separately.** Recognising a printed `.-`, hearing it
at speed, and keying it are different abilities that improve at different rates.
A character only reaches _Mastered_ with evidence in all three, so two hundred
perfect recognitions alone will never master it.

**Farnsworth timing is on by default.** Characters play at full speed with the
gaps stretched. Slowing the characters themselves teaches people to count
individual beeps, and that habit becomes a hard ceiling around 10 WPM.

**How patient the key is has nothing to do with WPM.** At 15 WPM a character
ends after 240 ms of silence — correct for a competent operator, hopeless for a
beginner who means to send `S` and, three seconds of hesitation later, has sent
`E E E`. Keying patience is its own setting, defaulting to 1.6 seconds, with a
manual mode that removes the clock entirely.

**Only transform and opacity animate.** Three things were breaking that and
one of them carried a comment claiming it was not: the key faded its
background-colour and box-shadow, the power meter animated `width`, and a
toggle used `transition-all`. Animating a layout property runs layout on every
frame; `box-shadow` is among the most expensive things to animate at all. The
key now has no transition whatsoever, which is also more correct — a key is
down or up, and easing that blurs the boundary a learner is timing against.

**The pages people find in a search ship no framework.** The 22 word pages and
the alphabet chart used to load 190 KB of React to attach a click handler to
markup that was already complete. They are now 6–8 KB: the audio engine and
about a hundred lines of plain DOM code. React stays where it earns its keep —
the telegraph, the tree, practice — and the two players share one
implementation of the timing so they cannot drift apart.

**Assistants get Markdown, not a stripped-down web page.** Every article is
served twice: as HTML for people, and at the same URL with `.md` appended as the
source it was rendered from, linked with `rel="alternate"`. There is also
`/llms-full.txt` — the complete text of the site in one file, generated from the
same alphabet, curriculum and word notes the app runs on, so it cannot describe
a product that does not exist. A model answering a question about Morse code
should not have to fetch twenty pages and strip navigation out of each one; that
stripping is where quotes get mangled.

**Every page is prerendered to real HTML.** GPTBot, ClaudeBot and PerplexityBot
do not execute JavaScript. A client-rendered app is invisible to them, so the
whole site is static and only the interactive parts hydrate — the seven-day
plan, the blog and the word index ship **zero bytes of JavaScript**, and pages
that do load React only do so because there is genuinely something to interact
with.

**The daily challenge has no server behind it.** The UTC date is the seed, so
every browser runs the same generator and gets the same eight lines, the same
speed and the same pass mark. It works offline, it cannot go down, and there is
nothing to pay for. The streak counts attempts rather than passes, because
showing up is the only thing a streak is any good at encouraging.

**A dropped character costs one mark, not the rest of the line.** Copy practice
compares what was sent against what you typed by aligning them first, so missing
the second letter of `HELLO` is scored as one miss rather than as four wrong
answers. Grading it position by position would tell a learner they got 20% of a
line they had almost entirely right.

**Nothing is written twice.** The alphabet is one object. The tree, the
curriculum, the word pages, the translator, `llms.txt` and every code printed
anywhere all derive from it, so a reference page cannot disagree with the
trainer.

---

## Architecture

```
src/
├── engine/        Framework-agnostic core, fully unit-tested
│   ├── timingEngine.ts    PARIS WPM + ARRL Farnsworth
│   ├── morseEncoder.ts    Text → Morse
│   ├── morseDecoder.ts    Morse → text, plus a live decoder for the key
│   ├── audioEngine.ts     Web Audio CW tone, envelope-shaped
│   └── keyEngine.ts       Straight key: short/long press, gap detection
│
├── data/          Single sources of truth
│   ├── morseAlphabet.ts   ITU-R M.1677-1
│   ├── tree.ts            Derived from the alphabet, never hand-authored
│   ├── curriculum.ts      The 7-day plan
│   └── words.ts           The word pages
│
├── game/          mastery.ts · spacedRepetition.ts
├── storage/       Versioned, validated localStorage
├── components/    React islands
├── pages/         Astro routes
└── pwa/           Build-time manifest + service worker generation
```

**Stack:** [Astro 7](https://astro.build) (static output) · React 19 islands ·
Tailwind 4 · TypeScript strict · Vitest · Web Audio API

No backend, no database, no analytics beyond anonymous, cookieless
[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/).

---

## Running it locally

```bash
git clone https://github.com/iamcanturk/morse.git
cd morse
npm install
npm run dev
```

| Command          | Does                                                         |
| ---------------- | ------------------------------------------------------------ |
| `npm run dev`    | Dev server on :4321                                          |
| `npm run build`  | Static build to `dist/`, plus manifest and service worker    |
| `npm run verify` | Format check, type check, tests — run this before committing |
| `npm test`       | Vitest                                                       |
| `npm run deploy` | Verify, build, rsync to the server, assert the site responds |

Requires Node 20.11+.

### Testing

661 tests, covering the parts where being wrong is silent:

- **Timing** — sending PARIS once takes exactly `60/WPM` seconds, checked at
  5/12/20/35 WPM and under Farnsworth. Every speed readout depends on it.
- **Codec** — every character round-trips through encode and decode.
- **Key** — an OS auto-repeat keydown mid-hold yields one dash, not a burst
  of dots.
- **Storage** — a hand-edited export claiming more correct answers than
  attempts is clamped rather than shown as 16,000% accuracy.
- **Content** — no day of the plan can suggest a practice word containing a
  letter it has not taught yet, and factual claims made in prose on the public
  pages are asserted against the alphabet.
- **Copy grading** — a dropped character costs one mark, not every character
  after it: the two lines are aligned by edit distance before they are compared.
- **Keyboard** — binding the key to Space must not stop every button and link
  on the page being activated by Space, which is what a `window` listener with
  an unconditional `preventDefault` does.
- **Games** — playable, not just correct. Whole runs are simulated against a
  player who can only deal with one prompt at a time, because a version that
  could answer several at once made an impossible game look survivable and hid
  a real balance bug. A competent player must last; a passive one must lose.
- **Analytics wiring** — every event declared in the closed `EventName` union
  must actually be fired from somewhere. A declared-but-unsent event is
  invisible: TypeScript is happy, every test passes, and the only symptom is a
  number that stays at zero, which looks exactly like nobody using the feature.
- **Links** — every internal reference in the built output must resolve. 2,301
  of them across 47 pages, checked against what the build actually produced.
- **Reachability** — `npm run verify` fails on a module under `src/data`,
  `src/game`, `src/engine`, `src/storage` or `src/analytics` that no page can
  reach. Three features once shipped fully tested and completely unreachable;
  coverage is exactly the wrong instrument for catching that.

---

## Deployment

Static files on [CloudPanel](https://www.cloudpanel.io/) behind Cloudflare. The
nginx vhost is version-controlled in [`deploy/`](deploy/cloudpanel-vhost.conf) —
the default static template caches `sw.js` for ten years, which would pin every
returning visitor to whichever build they first loaded.

---

## Contributing

Contributions are genuinely wanted, and there are specific things that would
help more than others.

**If you are a licensed operator**, the thing I am least sure of is whether the
on-air conventions are right — the Q-codes, the prosigns, what an actual
exchange sounds like. I am not licensed. Being told where this is wrong is the
single most valuable thing anyone can do here, and an issue saying "the RST
phrasing is off" is a real contribution.

**If you learn Morse and it does not work for you**, say so and say where. The
place people quit is the most important information this project can get, and
it is invisible from the inside — nothing here reports back, by design.

**If you write code**, the ideas that would move this furthest:

- **Iambic keyer support.** Straight key only right now, and paddles are what
  most operators actually use.
- **Translations.** Everything is English. The learning content is
  language-independent; the interface is not.
- **A11y testing with a real screen reader.** The markup has been audited and
  the obvious failures are fixed, but it has never been driven by someone who
  uses one daily.
- **[Iambic keyer and paddle support](https://github.com/iamcanturk/morse/issues/43)** —
  the biggest single gap.
- **[Translations](https://github.com/iamcanturk/morse/issues/44)** — say which
  language before you start so two people do not do the same one.
- **[Good first issues](https://github.com/iamcanturk/morse/labels/good%20first%20issue)**
  if you want something small and self-contained to start with.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it is short. The one rule worth
knowing up front: `npm run verify` has to pass, and a pre-push hook enforces it,
so a broken build cannot reach the repo.

### Not code, still useful

- **Star the repo.** It is the cheapest signal that this is worth someone's
  time, and it is most of how anyone finds it.
- **Link to it** from a club page, a wiki, a forum answer.
- **Tell someone learning Morse.** Word of mouth beats everything else here,
  because there is no advertising budget and no growth loop.

---

## Author

Built and maintained by **[Can Türk](https://iamcanturk.dev)** — I build things
on the web, mostly the kind that work without an account.

<p>
  <a href="https://iamcanturk.dev"><img src="https://img.shields.io/badge/website-iamcanturk.dev-00E88F?style=for-the-badge" alt="iamcanturk.dev"></a>
  <a href="https://x.com/iamcanturk"><img src="https://img.shields.io/badge/X-@iamcanturk-000000?style=for-the-badge&logo=x" alt="@iamcanturk on X"></a>
  <a href="https://github.com/iamcanturk"><img src="https://img.shields.io/badge/GitHub-iamcanturk-8B98A5?style=for-the-badge&logo=github" alt="iamcanturk on GitHub"></a>
</p>

If MorseForge is useful to you, a ⭐ or a link back to
[morse.iamcanturk.dev](https://morse.iamcanturk.dev) genuinely helps — and if
you build something with it, I would like to see it.

Available for work: **[iamcanturk.dev](https://iamcanturk.dev)**.

---

## Credits

Morse codes and timing follow
[ITU-R M.1677-1](https://www.itu.int/rec/R-REC-M.1677/en), the ITU
recommendation defining International Morse code. Farnsworth timing follows the
ARRL standard. The Koch ordering follows Ludwig Koch's original method.

Built with [Astro](https://astro.build), [React](https://react.dev) and
[Tailwind CSS](https://tailwindcss.com). Fonts are
[Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) and
[JetBrains Mono](https://www.jetbrains.com/lp/mono/), self-hosted.

## License

[MIT](LICENSE) © Can Türk — use it, fork it, ship it. Attribution is
appreciated but not required.
