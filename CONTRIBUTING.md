# Contributing

Thanks for looking. This is a small project with a clear shape, so a short
guide is enough.

## Getting set up

```bash
npm install
npm run dev
```

Node 22.12 or newer (Astro 7 will not start on anything older).

Before opening a pull request:

```bash
npm run verify
```

That runs the formatter check, the type checker, the reachability check and the
tests. CI runs the same thing, so if it passes locally it will pass there. If
you changed anything a visitor can see, also run `npm run verify:all`, which
builds the site and runs the checks against the built output (see "What the
build checks" below).

## The one rule that matters

**Morse codes are never written by hand outside `src/data/morseAlphabet.ts`.**

Everything else — the tree, the seven-day plan, the word pages, the translator,
`llms.txt`, every code printed anywhere on the site — derives from that one
object. This is why a reference page cannot disagree with the trainer, and it
is worth protecting.

The same goes for facts stated in prose. An early version of the word pages
hand-wrote element counts, and five of the six were wrong. If a page needs a
number, compute it; if a claim can be checked against the alphabet, add a test
that checks it. There is a `describe('claims made on the public pages')` block
in `morseAlphabet.test.ts` for exactly this.

## Tests

Test the things that fail silently. A wrong colour is obvious on sight; a
timing engine that is 4% fast is not, and it makes every speed readout, session
result and leaderboard number wrong without ever throwing.

The anchor test is that sending the word PARIS once takes exactly `60/WPM`
seconds. If a change to timing breaks that, it is the change that is wrong.

Anything that needs a clock takes one by injection — see `KeyEngineClock` — so
tests drive time by hand rather than waiting on real timers.

## What is hard to test here

`AudioContext` does not exist in Node, so the audio engine's scheduling maths is
unit-tested but the engine itself is verified by hand in a browser. If you touch
`audioEngine.ts`, please say in the pull request how you checked it.

## Style

Prettier decides formatting; do not argue with it, just run `npm run format`.

Comments should explain _why_, not _what_. The codebase has a lot of decisions
that look arbitrary without their reasoning — why the dot/dash boundary sits at
two units, why keying patience is separate from WPM, why the tree layout needs
an explicit comparator. Those comments are load-bearing. Please add them in the
same spirit rather than narrating the code.

## Rules the redesign added

Short, and each one exists because the opposite happened once.

**Pages are registered, and copy has one home.** Every route is an entry in
`src/config/pages.ts`: its title, description, H1, intro, nav label and whether
it is indexable. A page renders those fields rather than retyping them, and the
header, the footer, the sitemap, `llms.txt` and `noindex` all read the same
entry. A page file with no entry, or an entry with no file, fails a test. Facts
a sentence quotes (counts, speeds, durations) come from `src/config/facts.ts`,
and FAQs from `src/data/faq.ts`, which is also what produces the FAQPage
JSON-LD. A figure typed into a page is a figure that goes stale.

**Storage goes through the shared stores and `bankActivity`.** Never call
`localStorage` from a component, and never keep a second copy of a store in
component state. Use the page's shared instances from `src/storage`, so every
screen and every browser tab sees the same record. Anything that earns XP, a
streak day or an achievement does it through `bankActivity` in
`src/storage/activity.ts`, once, from an event handler and not from inside a
state updater (React may run an updater twice). A session with zero answers
banks nothing.

**Only `transform` and `opacity` animate.** No `transition-colors`, no
`transition-all`, no animating `width`, `left` or `box-shadow`. Honour reduced
motion from both sources: the OS setting and `html[data-motion=reduce]`, which
Settings can set in either direction. In practice that means the `mf-motion:`
and `mf-still:` variants in `global.css`, not a bare `motion-safe:`.

**No hand-typed Morse, now enforced.** The rule above used to rest on review.
It is now a set of tests that scan the copy files and the reference components
for a run of dots and dashes inside a string and fail on it (`proseScan.ts` and
the `reference.test.ts` files). Write `encode('SOS')` or interpolate from
`MORSE_ALPHABET`.

**Every page but the landing and the 404 uses `PageShell`.** Pass it the registry's
`h1`, `intro` and `breadcrumbTrail(path)`; it supplies the `<main>`, the
breadcrumb and the title row, so every H1 sits in the same place. Choose
`width="tool"` or `"prose"` (those are the only two) and set `instrumentFirst` on
a tool page, which on a phone puts the instrument straight under the H1 and the
intro below it (the HTML order does not change). The default slot holds the
instrument and nothing else; explainers and the FAQ go in `slot="more"`, which
spaces them itself, so they take no `mt-*` and no `mx-auto`. Do not put
`overflow` on an ancestor of the instrument: the telegraph's tape is sticky.

**Never hide the focused element, and never set your own scroll offset.**
`global.css` gives `html` a `scroll-padding-top` that clears the sticky header.
A page with its own sticky layer publishes its height in `--mf-sticky-extra`; it
does not add `scroll-mt-*`, which would double the offset. When a screen moves on
(a new prompt, a result), move focus to it with `preventScroll` and scroll the
instrument into view yourself.

**Signal is a contract.** Anything that makes a Morse signal reaches the learner
through `settings.signal` (Sound, Lamp or Both), never through `audio.enabled`
directly. Read intent with `hasSound` and `hasLamp`, change it only with
`withSignal`, and send with `useTransmitter`, which drives the tone and the lamp
from one timeline; draw the lamp with `SignalLamp`. A new listening task must
work in Lamp mode and must not be disabled when sound is off. Where a code is
shown as dots and dashes, add its spoken twin for screen readers with
`spokenCode()` instead of a local copy.

**What the build checks.** After `npm run build`:

- `npm run check:links` fails on any internal link that resolves to nothing.
- `npm run check:reachable` fails on a module under `src/data`, `src/game`,
  `src/engine`, `src/storage` or `src/analytics` that no page can reach. It is
  part of `npm run verify`.
- `node scripts/check-seo.mjs dist` checks titles and descriptions against
  their length limits, one visible H1 per page, canonicals, JSON-LD that parses,
  noindex pages kept out of the sitemap, every `.md` alternate, `robots.txt`
  and `llms.txt`. `npm run check:build` runs the links and SEO checks along with
  the rest of its assertions about the build.
- Dates in the sitemap come from git, so commit before you build.

## Commits

Conventional Commits, referencing an issue where there is one:

```
feat(engine): add iambic keyer mode

Refs #42
```

## Scope

MorseForge teaches Morse code. It is deliberately not a collection of
translators — binary, NATO phonetic and the rest are out of scope, because
every one of them makes the product a little less about the thing it is for.
