---
title: Farnsworth timing, and why it beats slowing down
description: Full-speed characters with stretched gaps teach the rhythm of each one. Slowing the characters themselves teaches counting, which caps you at 10 WPM.
published: 2026-08-23
answer: Farnsworth timing sends each character at full speed but stretches the silence between characters, so the overall rate stays slow while the characters themselves sound exactly as they will at speed. Slowing the characters down instead teaches you to count individual beeps, and that habit becomes a ceiling you have to unlearn later — which is much harder than never building it.
tags: [technique, timing, speed]
---

Every Morse trainer has a speed control. Most have two, and the difference
between them is the most consequential setting you will touch.

## The problem with slowing down

The obvious way to make Morse easier is to send it slower. At 5 words per
minute a dot lasts 240 milliseconds — long enough to hear as a distinct event,
long enough to count.

And that is exactly the problem. At that speed you do not hear `-.-.` as C. You
hear _dah, di, dah, di_, and you count four separate things and add them up.
The counting works. It gets you through the alphabet. It also becomes the only
way you know how to decode, and counting has a hard ceiling — somewhere around
10 WPM the beeps arrive faster than you can count them, and everything falls
apart at once.

People who learn this way describe hitting a wall. It is not a plateau. It is
the counting strategy running out of road.

## What Farnsworth does instead

Named after Russ Farnsworth, the method separates two things that a single
speed control conflates:

- **Character speed** — how fast the dots and dashes inside a character are
  sent
- **Effective speed** — how fast the text arrives overall

Farnsworth sends the characters at full speed, say 18 WPM, and pads the silence
between them until the overall rate is whatever the learner needs, say 8 WPM.
The character `-.-.` sounds _exactly_ as it will at 18 WPM — a single rhythmic
shape, too fast to count — and then there is a long pause before the next one
while you work out what you just heard.

You are given time to think. You are not given time to count.

## The arithmetic

Morse is defined in units, where a dot is one unit:

| Element                | Units |
| ---------------------- | ----- |
| Dot                    | 1     |
| Dash                   | 3     |
| Gap inside a character | 1     |
| Gap between characters | 3     |
| Gap between words      | 7     |

The reference word PARIS is exactly 50 units long including its trailing word
gap, which is where words-per-minute comes from: at W WPM, one unit lasts
`1200 / W` milliseconds.

Of those 50 units, 31 are the actual keying and 19 are the gaps. The ARRL
method for Farnsworth keeps the 31 at the character speed and expands the 19
until the whole thing takes as long as the slower effective speed requires,
distributing the extra time across character and word gaps in their normal 3:7
ratio.

So at 18/8 Farnsworth, each character takes the same time it would at 18 WPM,
and the silences do all the stretching.

## What to actually set

A reasonable starting point, and what this trainer defaults to:

- **Character speed: 15–20 WPM.** High enough that counting is not an option.
  Do not lower this, ever. It is the one number that should not move.
- **Effective speed: start at 5–8 WPM.** This is the dial you adjust.

Then raise the _effective_ speed as you get comfortable, and leave the
character speed alone until the two meet. When you are copying at 18/18 you are
copying at 18 WPM with standard timing, and you got there without ever learning
to count.

If a session feels impossible, lower the effective speed. If it feels easy,
raise it. The character speed is not part of that conversation.

## The uncomfortable part

Farnsworth is harder at the start. Counting works, and it works immediately,
and giving it up means several sessions where you feel worse than you did the
day before.

That trade is the whole method: a slower first week in exchange for not hitting
a wall in the second month. It is the same reason [learning from a chart feels
faster and ends
badly](/blog/why-a-morse-code-chart-does-not-work/) — the shortcut is real, and
so is the bill.

You can set both speeds independently in [settings](/settings/), and hear the
difference immediately in the [translator](/morse-code-translator/) by sending
the same word at 18/8 and at 8/8.
