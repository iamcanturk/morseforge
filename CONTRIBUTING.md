# Contributing

Thanks for looking. This is a small project with a clear shape, so a short
guide is enough.

## Getting set up

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run verify
```

That runs the formatter check, the type checker and the tests. CI runs the same
thing, so if it passes locally it will pass there.

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
