# Launch kit

Drafts for each platform. They are deliberately different from each other —
posting the same paragraph five times is the fastest way to be ignored on all
five, because each audience is checking for something different.

Every number below is real and checked against the build. Do not round any of
them up.

| Claim                  | Value                                  |
| ---------------------- | -------------------------------------- |
| Tests                  | 641                                    |
| Seven-day plan         | 135 minutes total                      |
| Coverage               | 26 letters, 10 digits                  |
| JS on a word page      | ~3 KB                                  |
| JS on the practice app | ~186 KB (React)                        |
| Licence                | MIT                                    |
| Offline                | Yes, PWA                               |
| Account required       | No                                     |
| Server                 | None. Progress never leaves the device |

**Do not claim:** a Lighthouse score (never measured), user numbers, that it is
the best or fastest anything, or that it works on every browser (the studio and
recording need MediaRecorder).

---

## X

Post it after the social preview image is live, or the link unfurls as a blank
card.

**Main post**

> I built a Morse code trainer.
>
> Not a translator with a chart bolted on — it teaches the code in the order it
> is actually structured, plays real CW audio, and turns your keyboard into a
> straight key.
>
> No account. No ads. No server. Your progress never leaves your device.
>
> morse.iamcanturk.dev

**Reply 1 — for the people who ask how**

> Some of what is under it:
>
> • Farnsworth timing on by default — full-speed characters, stretched gaps.
> Slowing the characters down is what gives people a hard ceiling near 10 WPM.
> • Three skills tracked separately per character. A letter is only mastered
> with evidence in all three.
> • Word pages ship ~3 KB of JavaScript. The app pages ship React because they
> earn it.
> • 641 tests, including one asserting that sending PARIS once takes exactly
> 60/WPM seconds.

**Reply 2 — the visual one, attach the GIF**

> The Signal Tree is the actual structure of Morse: a dot branches one way, a
> dash the other, so every character sits at the address its own code spells
> out. It lights up as you learn.
>
> That is also why day one is E and T, and why Q and Z come last.

**Reply 3 — the link home**

> Free and open source, MIT.
>
> github.com/iamcanturk/morse

---

## Hacker News

Post as **Show HN**. The rules are strict and the audience is allergic to
marketing language — no adjectives you cannot defend, no "revolutionary", no
emoji.

**Title** (80 char limit, and it must start with Show HN:)

> Show HN: A Morse code trainer that runs entirely in the browser

**First comment — post it immediately after submitting**

> I have wanted to learn Morse for years and bounced off every tool I tried,
> always the same way: memorise a chart, hit a wall around 10 WPM, quit.
>
> The wall turns out to be structural. Learning `A = .-` from a table teaches
> you to translate — hear the beeps, convert to dots and dashes, look up the
> letter — and that extra step is a fixed cost you cannot practise away. So
> this teaches by sound from the first minute, with Farnsworth timing on by
> default: characters at full speed, gaps stretched. You get time to think but
> never time to count.
>
> Technically it is Astro with React islands. A few things I found interesting
> to get right:
>
> - Timing is derived from the PARIS standard rather than hardcoded, and there
>   is a test asserting that sending PARIS once takes exactly 60/WPM seconds at
>   several speeds. Every WPM readout in the app depends on that being true.
> - The straight key needed its own patience setting, separate from WPM. At
>   15 WPM a character ends after 240ms of silence, which is right for an
>   operator and hopeless for a beginner who means to send S and, after three
>   seconds of hesitation, has sent E E E.
> - Copied lines are graded by aligning the sent and typed text with edit
>   distance before comparing, so dropping one character costs one mark instead
>   of invalidating everything after it.
> - Content pages ship no framework at all — a word page is about 3 KB of JS.
>   The interactive screens ship React because they earn it.
>
> No account, no server, no analytics beyond an anonymous counter you can turn
> off. Progress is in localStorage and never leaves the device.
>
> MIT: https://github.com/iamcanturk/morse

**If it gets traction, the questions you will get, and honest answers:**

- _"Why not just use LCWO?"_ — LCWO is excellent and has been for twenty years.
  This is not trying to replace it; it is a different bet on what a beginner
  needs in the first week, and it works offline on a phone.
- _"Koch or Farnsworth?"_ — Both, and they are not alternatives. Koch is an
  ordering, Farnsworth is a timing. The app implements three orderings and lets
  you pick.
- _"Does it do iambic keying / paddle support?"_ — No. Straight key only for
  now. Say so plainly rather than promising it.

---

## Reddit

**Check each subreddit's self-promotion rules before posting.** Several ham
radio subs restrict it to certain days or require you to be an established
commenter. Getting this wrong burns the audience you most want.

### r/amateurradio

This audience knows more about Morse than you do. Lead with the thing that is
useful to them, not with the fact that you built it.

**Title**

> Built a free browser-based CW trainer — Farnsworth by default, works offline,
> no account

**Body**

> I got tired of bouncing off Morse trainers and built one. It is free, open
> source, and runs entirely in the browser — nothing to install, no signup, and
> your progress stays on your device.
>
> What might be worth your time:
>
> - Real CW sidetone with envelope shaping, adjustable pitch and speed
> - Farnsworth on by default, character speed and effective speed set
>   separately
> - Your keyboard as a straight key, with the decoder's patience adjustable
>   independently of WPM
> - Koch, shortest-first, or alphabetical ordering — the page says plainly that
>   alphabetical is the worst of the three
> - Copy practice on code groups, common words, on-air phrases and callsigns
>
> morse.iamcanturk.dev
>
> I am not a licensed operator, so I would genuinely appreciate being told
> where the on-air conventions are wrong. That is the part I am least sure of.

That last line matters. It is true, it invites the correction they were going
to make anyway, and it converts a critic into a contributor.

### r/SideProject or r/webdev

Different audience — they care about how it is built, not about CW.

**Title**

> I built a Morse code trainer where the content pages ship 3 KB of JS and the
> app pages ship React

**Body**

> Astro with React islands. The interesting constraint was that the same site
> has to be two things: a set of reference pages that need to be fast and
> crawlable, and an app with real-time audio and a keyer.
>
> So the word pages and the alphabet chart have no framework at all — about
> 3 KB of hand-written DOM code over server-rendered markup, down from 194 KB
> when they were React components. The practice screens still ship React,
> because they earn it.
>
> Other things I would do the same way again:
>
> - All the game and timing logic is pure and tested away from the DOM. 641
>   tests, and the ones that have caught real bugs are the boring ones.
> - A build check that fails on any module under src/game or src/data that no
>   page can reach. Three features once shipped fully tested and completely
>   unreachable.
>
> Source: github.com/iamcanturk/morse — MIT.

---

## Product Hunt

**Tagline** (60 characters max)

> Learn Morse code by ear, free and offline

**Description**

> Most Morse sites are a translator with an alphabet chart bolted on.
> MorseForge is a trainer: you learn the code in the order it is actually
> structured, hear it as real CW tones, and send it back with your own
> keyboard.
>
> It tracks recognition, listening and sending separately, because they are
> different skills — a character is only mastered with evidence in all three.
> Spaced repetition picks what you are closest to forgetting.
>
> No account. No ads. No server: your progress never leaves your browser. Works
> offline. Open source under MIT.

**Maker's first comment**

> Hi everyone. I built this because I kept trying to learn Morse and kept
> quitting at the same place — about 10 words per minute, three weeks in.
>
> The reason turned out to be the chart. Memorising `A = .-` teaches you to
> translate rather than to hear, and that translation step becomes a ceiling
> you cannot practise away. So this teaches by sound from the first minute.
>
> Everything runs in your browser. There is no backend at all, which means
> nothing to sign up for, nothing that can leak, and nothing that stops working
> if I lose interest.
>
> Happy to answer anything, especially about the audio engine — getting CW to
> sound right without key clicks was the part I most underestimated.

---

## LinkedIn

Different register: the story, not the specs. Keep it short.

> I have tried to learn Morse code four times over ten years. I quit at the
> same point every time — around 10 words per minute, about three weeks in.
>
> This time I looked into why, and the answer was slightly annoying: the
> problem was the chart I had been learning from. Memorising that A is dot-dash
> teaches you to translate rather than to hear, and that extra step is a fixed
> cost that no amount of practice removes.
>
> So I built the trainer I wanted. It teaches by sound from the first minute,
> tracks recognising, hearing and sending as three separate skills, and works
> offline with no account and no server.
>
> It is free and open source: morse.iamcanturk.dev
>
> Turns out the fastest way to finally learn something is to spend considerably
> longer building the tool for it.

---

## A technical article — dev.to, Hashnode, or your own site

The strongest angle is the one nobody else can write, because it needs the
implementation. Suggested title:

> Why your Morse code app is lying about its speed

Covering: WPM is defined by the word PARIS being exactly 50 units; most
implementations hardcode a dot length and drift; here is the test that pins it;
here is what Farnsworth actually does to the 31 keying units and the 19 spacing
units.

Second-best angle:

> I deleted React from half my site and it got better

Covering the 194 KB → 3 KB change, why the content pages never needed it, and
why the app pages kept it.

Both link back to the site without being about the site, which is the only kind
of technical post that travels.

---

## GitHub release notes

Tag `v1.0.0`.

> **MorseForge 1.0**
>
> A free, offline-capable Morse code trainer that runs entirely in the browser.
>
> **Learning**
>
> - Seven-day plan covering all 26 letters and 10 digits in 135 minutes
> - Three teaching orders: shortest-first, Koch, alphabetical
> - Recognition, listening and sending tracked separately per character
> - Spaced repetition scheduling
>
> **Practice**
>
> - Free practice, 60-second challenge, shareable challenge links
> - Copy practice on code groups, words, on-air phrases and callsigns
> - A daily challenge generated from the date, identical for everyone, with no
>   backend
> - Two games: Signal Defender for copying under pressure, Morse Runner for
>   sending under it
>
> **Tools**
>
> - Translator, playable alphabet chart, telegraph key, Signal Tree
>
> **Under it**
>
> - Real CW audio from the Web Audio API with envelope shaping
> - PARIS-standard timing with ARRL Farnsworth spacing
> - Installable PWA, works offline
> - 641 tests
> - No account, no server, no tracking beyond an anonymous counter you can turn
>   off

---

## Order and timing

1. **Social preview image uploaded** — everything else unfurls badly without it.
2. **GitHub release tagged** — gives the repo a front door.
3. **Show HN**, weekday morning US Eastern. If it does not catch, that is
   normal; you may repost once after a few months.
4. **X**, same day.
5. **Reddit**, spaced over the following week, one subreddit at a time, reading
   each set of rules first.
6. **Product Hunt** only if you can be present in the comments all day. A
   launch you cannot attend is worse than one you postpone.
7. **The technical article** a week or two later, once you know which questions
   people actually asked.

Answering every comment matters more than any of the copy above.
