# Show HN

**When:** Tuesday 27 October 2026, 08:30 US Eastern (15:30 Türkiye). US clocks
change on 1 November, so until then New York is 7 hours behind Istanbul.
**Who posts:** Can, from his own account. Post the first comment within a
minute of submitting.
**Link:** `https://morse.iamcanturk.dev/` (the site, not the repo: the landing
page is the demo).

## Rules that apply (news.ycombinator.com/showhn.html)

- It must be something you made, that people can try now, and that you are
  around to discuss. MorseForge fits: no signup, the front page is usable.
- Title starts with `Show HN:`. No superlatives, no emoji, no "I built".
- **Never ask anyone to upvote or comment**, not on X, not in a group chat, not
  "check out my HN post". HN detects voting rings and kills the post. Sharing
  the *site* elsewhere on the same day is fine; sharing the *HN link* with a
  request is not.
- If it doesn't take off, don't resubmit the same week. A second try months
  later, after a real change, is acceptable.
- Reply to criticism with information, never with defensiveness. Thank people
  for corrections and file them (see [post-launch.md](post-launch.md)).

## Title

Pick one. All are under 80 characters.

1. `Show HN: MorseForge – learn Morse code by ear, with a telegraph key in the browser` (79)
2. `Show HN: A Morse code trainer whose landing page is the first lesson` (67)
3. `Show HN: MorseForge – a free, offline Morse trainer that teaches by sound` (74)

Recommendation: **2**. It says what is unusual in one line, and it is the
thing people will try first.

## URL field

```
https://morse.iamcanturk.dev/
```

Leave the text field empty (a URL submission with an empty text box, then the
first comment). That is the HN convention for Show HN with a link.

## First comment

> Hi HN, I'm Can. MorseForge is a free Morse code trainer that runs entirely in
> the browser. No account, no ads, and your progress stays in localStorage.
>
> I'm taking a sailing course in Turkey that requires an amateur radio
> certificate, so I
> restarted the radio training I'd put off for years, and for me that meant
> learning Morse. Learning `A = .-` from a table teaches you to
> translate. You hear the beeps, convert them to dots and dashes, then look the
> letter up, and that extra step is a fixed cost. What worked for me was
> learning each character by its sound, so I turned that method into this. It
> teaches by sound from the first minute, with Farnsworth timing on by default:
> characters at full speed, gaps stretched.
>
> The front page is the first lesson. Tap the key (or press Space) once and
> you've sent E. Hold it and you've sent T. Two characters on day one, all 26
> letters and 10 digits by day seven.
>
> Some technical decisions that turned out to matter:
>
> - **Timing comes from the PARIS standard, not a hardcoded dot length.** A test
>   asserts that sending PARIS once takes exactly 60/WPM seconds at 5, 12, 20
>   and 35 WPM, with and without Farnsworth. Every speed readout depends on it.
> - **The key's patience is not WPM.** At 15 WPM a character ends after 240 ms
>   of silence. That is right for an operator and hopeless for a beginner, who
>   means to send S and sends E E E. Keying patience is a separate setting
>   (1.6 s by default, or a manual mode with no clock).
> - **A correct code commits the instant it is complete,** and a wrong one as
>   soon as it can no longer become a target. A beginner shouldn't wait out a
>   gap to find out they were right.
> - **Challenge links are seeded.** `?seed=…&pool=…&wpm=…` gives the friend the
>   same characters in the same order at the same speed, so two scores on one
>   link are comparable. The `beat` number in the link is a claim, and the page
>   says so: there's no server to check it.
> - **Secret messages live in the URL fragment**, which browsers don't send to
>   the server. The page says it is not encryption.
> - **Listening works without sound.** A Signal setting (Sound / Lamp / Both)
>   flashes a lamp on the same timeline as the tone, and lamp drills still count
>   as listening practice.
> - **Pages people find in search ship almost no JS.** About 6 KB gzipped on
>   content pages and about 13 KB on word and character pages. React only on the
>   interactive screens (about 85 to 130 KB). Everything is prerendered, with
>   `/llms.txt` and `.md` copies for assistants.
> - **1,936 tests.** The ones that caught real bugs were the boring ones: two
>   tabs racing on one localStorage key, OS key auto-repeat turning one dash
>   into a burst of dots.
>
> Astro 7 + React islands, Web Audio for the tone, MIT licensed:
> https://github.com/iamcanturk/morseforge
>
> Two honest gaps: it's a straight key only (no iambic paddles yet, that's
> issue #43), and it's English only (#44). I'm still in training and not
> licensed yet, so if the on-air conventions are wrong anywhere, I'd really
> like to know.

Word count is about 400. HN first comments of this length do fine when every
paragraph is information.

## Likely questions and answers

Keep answers short, factual, and in the first person. See
[post-launch.md](post-launch.md) for the longer objection list.

- **"Why not LCWO?"** "LCWO is great and has been for a long time. This makes a
  different bet on the first week: sending from minute one, a seven-day plan,
  and it works offline without an account. If LCWO works for you, keep using
  it."
- **"Koch or Farnsworth?"** "Both. They aren't alternatives: Koch is an
  ordering and Farnsworth is a timing. The default ordering walks the Morse
  tree by code length (E T first, then I A N M…); Practice also offers Koch
  order and alphabetical."
- **"Is the tone envelope-shaped / key clicks?"** "Yes, the Web Audio tone has
  an attack and release ramp. Pitch is adjustable in Settings."
- **"Analytics?"** "Cloudflare's cookieless Web Analytics and a first-party
  counter of event names (no URLs, no text), which you can switch off in
  Settings. /privacy/ lists exactly what each one sees."
- **"Paddles?"** "Not yet. Straight key only. #43 is the issue."
- **"The URL fragment isn't secret."** "Right. It's meant for fun, not
  privacy, and the page says it isn't encryption. The point is only that the
  text never reaches my server."

## Don'ts specific to this post

- Don't say "no tracking" or "no server". Say "no cookies, no account, no
  backend".
- Don't quote visitor numbers in the comments, even if asked. "I don't know
  yet" is fine.
- Don't edit the title after posting.
