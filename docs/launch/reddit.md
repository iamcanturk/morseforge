# Reddit

Reddit is where this launch can go wrong fastest. Most of these communities
remove posts from accounts that only show up to promote something. And the ham
subs know Morse far better than we do.

## Before any post

1. **Read the sidebar, the rules page and the pinned posts on the day you
   post.** Rules change without notice. Reddit could not be fetched from this
   session, so nothing below replaces reading them. Where a rule is marked
   *(verify)*, it comes from third-party summaries, not the subreddit itself.
2. **Account health.** Reddit's own guideline is the "9:1" spirit: most of your
   activity should be taking part, not linking your own work. If
   u/iamcanturk has little history in these subs, spend the week before
   commenting where you have something to add. Don't comment just to qualify.
3. **Say you made it.** One plain sentence: "I made this." Hiding it is what
   gets posts removed and accounts banned.
4. **One subreddit per day**, never the same text twice. Cross-posting the same
   paragraph is the strongest spam signal there is.
5. **If a rule is unclear, message the moderators first** with the post text
   and ask whether it's OK. A yes from mods is worth more than any wording.
6. Stay for the first two hours after each post and answer every comment.

## Order

| Day | Subreddit | Why this order |
| --- | --- | --- |
| Wed 28 Oct | r/morsecode | Small and friendly, and on-topic for learners. Good first feedback before the bigger ham subs |
| Thu 29 Oct | r/amateurradio | The biggest ham audience and the most expert. Go after fixing anything r/morsecode found |
| Sat 31 Oct | r/InternetIsBeautiful | Large general audience. The "first lesson is the landing page" hook fits it. Weekend traffic |
| Sat 7 Nov | r/webdev (Showoff Saturday only) | Technical audience. Self-promotion is only allowed on Saturdays *(verify)* |
| optional | r/ham_radio | Smaller, overlaps with r/amateurradio. Only if the r/amateurradio post was welcome, and wait a week |
| optional | r/SideProject | Built for exactly this. Low risk, low reach |

---

## r/morsecode

**Fit:** people learning or using Morse, who are the actual users.
**Rules:** check the sidebar. Small subs are usually fine with a tool post if
it's free and the maker is open about it.
**Flair:** use whatever the sub offers for resources/tools.

**Title**

> I made a free browser trainer that teaches by ear: the first lesson is
> tapping a key on the front page

**Body**

> I'm learning to sail in Turkey, and my course requires an amateur radio
> certificate, which for me meant learning Morse. Memorising the chart didn't
> stick; learning each letter by its sound did. So I turned that method into a
> trainer. It's free, runs in the browser, needs no account, and works offline.
>
> - The front page is the first lesson: tap the key (or press Space) and you've
>   sent E.
> - A 7-stage plan by code length: E T, then I A N M, S U R W, D K G O, H V F L P
>   J, B X C Y Z Q, then the digits.
> - Farnsworth timing on by default, with adjustable speed and pitch.
> - Listening, sending and recognition are scored separately per character.
> - A daily challenge that's the same for everyone, and a 60-second test you can
>   send to a friend (same characters, same order).
> - A Lamp mode, if you'd rather learn by light or have the sound off.
>
> https://morse.iamcanturk.dev
>
> It's open source (MIT) and I'd love to hear where it gets in your way. The
> place people quit is the thing I most want to know.

---

## r/amateurradio

**Fit:** the biggest and most knowledgeable audience. They'll test the timing
and the conventions. Lead with what's useful to them, not with the fact that
you built it.
**Rules:** *(verify)* check for a self-promotion rule, a weekly thread, or
required flair. If there's a weekly "projects/self-promo" thread, post there
instead of making a new post.

**Title**

> Free browser CW trainer: Farnsworth by default, works offline, no account.
> Feedback from operators wanted

**Body**

> I made a free, open-source CW trainer that runs in the browser. Nothing to
> install, no signup, and progress stays on your device. Some context: I'm
> working towards my amateur radio certificate (my sailing course in Turkey
> requires it), so I'm not licensed yet. The part I'm least sure of is whether
> the on-air material is right.
>
> What might be useful:
>
> - Web Audio sidetone with envelope shaping, adjustable pitch, speed and
>   Farnsworth spacing (character and effective speed set separately)
> - Your keyboard (or phone screen) as a straight key, decoded live, with the
>   decoder's patience set separately from WPM
> - Teaching order by code length, Koch, or alphabetical
> - Copy practice on code groups, common words, on-air phrases and callsigns,
>   graded character by character
> - A daily set of 8 lines, identical for everyone, generated from the UTC date
>   (no server)
>
> https://morse.iamcanturk.dev
>
> Paddles too: Iambic A and B with dot/dah memory, on `[`/`]` or Left/Right
> Ctrl for USB paddle adapters. That part is new, so I'd value a paddle
> user's take on the timing. English only for now.
>
> If the prosigns, Q-codes or the phrasing of an exchange are off, please tell
> me. I'll fix it and credit you in the changelog. Source:
> https://github.com/iamcanturk/morseforge

Note: "credit you in the changelog" is a promise. Only keep it if you'll do
it. A one-line thanks in the release notes is enough.

---

## r/InternetIsBeautiful

**Fit:** a general audience that likes single-purpose, free, no-signup sites.
That's exactly what this is.
**Rules** *(verify; from third-party summaries)*:
- Free, unique, single-purpose. No signups, no paywalls.
- No AI-generated primary content.
- A 90/10 self-promotion balance on the account.
- Titles describe the site, without hype.

**Title** (describe, don't sell)

> A Morse code trainer where the landing page is the first lesson: tap the key
> and you've sent your first letter

**Body / first comment** (if the sub allows text; otherwise post as a
comment)

> I made this. It's free, runs in the browser, needs no account and works
> offline. Seven stages take you from E and T to all 26 letters and 10 digits.
> There's also a telegraph key on your keyboard and a page that turns a message
> into a link that plays it in Morse. Source is MIT on GitHub if you want to
> look under the hood.

Link: `https://morse.iamcanturk.dev/`

---

## r/webdev — Showoff Saturday only

**Fit:** developers. They care how it's built, not about CW.
**Rules** *(verify)*: self-promotion only on Saturday, with the "Showoff
Saturday" flair. On any other day the post is removed.

**Title**

> [Showoff Saturday] A Morse trainer where content pages ship ~6 KB of JS and
> only the interactive screens hydrate React

**Body**

> Astro 7 with React islands. The same site has to be two things: reference
> pages that are fast and crawlable (one page per character, 22 word pages, a
> 7-day plan), and an app with real-time audio and a key you can tap.
>
> - **Content pages ship no framework.** About 6 KB gzipped (only the layout's
>   inline scripts). Word and character pages, with a small audio player, are
>   about 14 KB. Interactive screens are about 90 to 140 KB.
> - **One timeline drives the tone and the lamp,** so the sound and the visual
>   "Lamp" mode can't drift apart.
> - **Shared state across tabs:** a store re-reads the raw localStorage string
>   before each write, so two tabs don't overwrite each other's XP.
> - **A build check fails on unreachable modules.** Three features once shipped
>   fully tested and completely unreachable from any page.
> - **Assistants get Markdown:** `.md` copies at the same URL and
>   `/llms-full.txt`, generated from the same data the app runs on.
> - **2,067 tests,** including one asserting PARIS takes exactly 60/WPM seconds.
>
> https://morse.iamcanturk.dev · MIT: https://github.com/iamcanturk/morseforge

---

## r/ham_radio (optional, a week after r/amateurradio)

Use the r/amateurradio text, but lead with whatever changed because of that
thread: "Thanks to feedback in r/amateurradio, the RST phrasing is now …".
That's a genuine reason to post again, and it shows you listen.

## r/SideProject (optional)

> **Title:** MorseForge: a Morse trainer that starts with you sending, not
> reading
>
> **Body:** two lines on the idea, the link, and one sentence asking what
> would make you come back on day two.
