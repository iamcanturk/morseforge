# Facts sheet

Every claim in the launch copy comes from this page. If a sentence in a draft
is not backed by a row here, cut it or check it and add the row first.

Checked on **2026-10-21** against the live site (https://morse.iamcanturk.dev),
and the README measurements of the same day's build.
Re-check the moving numbers (tests, pages) on launch morning; they change with
every release.

## Numbers

| Claim | Value | Where it was checked |
| --- | --- | --- |
| Tests | 1,936 passing, 100 files | README measurement of the 2026-10-21 build (not re-run here: this worktree has no `node_modules`). Re-run `npx vitest run` on launch morning |
| Pages | 88 built pages, 83 in the sitemap (the rest are noindex or private) | README build notes, `sitemap-0.xml` |
| Plan | 7 stages: E T · I A N M · S U R W · D K G O · H V F L P J · B X C Y Z Q · 0–9 | live `/learn/` |
| Day one | 2 characters (E and T) | live landing copy |
| By day seven | all 26 letters and 10 digits | live landing copy |
| Practice in the plan | 2 hours 15 minutes in total | live landing "by the numbers" panel |
| Character pages | 36 (A–Z, 0–9) | README build notes |
| Words | 22 words and phrases, each playable | README |
| Markdown copies | 29 `.md` alternates, plus `/llms.txt` and `/llms-full.txt` | README, live |
| Daily | 8 lines a day, identical for everyone on the same UTC date; today's is No. 62, 15 WPM spaced to 7 WPM, pass mark 80% | live `/daily/` |
| Secret message | up to 80 characters, carried in the URL fragment | README, live `/message/` |
| JS weight | content pages ~6 KB gzipped (layout inline scripts only); word/character/reference pages ~13 KB; interactive screens ~85–130 KB (landing 91, practice 120, lesson 131) | README build notes |
| Licence | MIT | GitHub |
| Stack | Astro 7 static output, React 19 islands, Tailwind 4, TypeScript strict, Vitest, Web Audio API | README |

## Things that are true and worth saying

- The landing page is the first lesson: tap the key (or press Space) and E is
  sent and confirmed. E, T, A and the hero opens stage 1 at "Hear it".
- Teaches by ear, Farnsworth timing on by default (characters at full speed,
  gaps stretched).
- Recognition, listening and sending are tracked separately; a character is
  only *Mastered* with evidence in all three.
- The 60-second challenge link carries a seed: the friend gets the same
  characters, in the same order, at the same speed. The `beat` number in the
  link is a claim, and the page says so (no server checks it).
- The daily share is spoiler-free: one square per line, a percentage rounded
  **down**, the streak, and the daily number. Never the text of a line.
- The secret message lives only in the URL fragment, which browsers do not send
  to a server. The page says plainly it is not encryption.
- Signal setting: Sound, Lamp or Both. In Lamp mode listening drills flash a
  lamp with the same timing and still count as listening.
- The telegraph is a brass straight key on the keyboard, decoded live; some
  words answer back with a stamp (SOS, CQ, 73, 88). Don't list them all; let
  people find them.
- No account, no ads. Progress stays in the browser (localStorage), with an
  export/import backup.
- Works offline as an installable PWA.
- Analytics: Cloudflare's cookieless Web Analytics, plus a first-party counter
  of event names that can be switched off in Settings. Spelled out on
  `/privacy/`.
- Every page is prerendered HTML; `/llms.txt` and `.md` alternates exist for
  assistants.
- Morse codes follow ITU-R M.1677-1; the non-ITU marks are kept in a separate
  table.
- Open issues that are honest gaps: **#43 iambic keyer / paddles** (not shipped;
  straight key only today) and **#44 translations** (English only today).

## Do not claim

- User numbers, visitor numbers, "thousands of learners", ratings, or any
  testimonial. There are none to quote.
- That it is the best, fastest or most accurate trainer.
- A Lighthouse or Core Web Vitals score. Never measured for this release.
- "No analytics" or "no tracking". There are two counters (see above). Say
  "no cookies, no account" instead.
- "No server". There is a static file server and Cloudflare. Say **no backend**.
- "Learn Morse in 7 days" as a promise of fluency. The plan *introduces* every
  character in seven days; copying at speed takes much longer. Say "meet every
  character in seven days" or "all 26 letters and 10 digits by day seven".
- WPM for a learner's score. Results are in characters a minute on purpose.
- Iambic or paddle support. Not shipped.
- That Can is a licensed operator. He is not, and the README says so.
- Anything about competitors you have not checked yourself (pricing, ads,
  accounts). Describe MorseForge; don't describe them.
