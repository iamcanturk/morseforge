# MorseForge launch plan

Site: https://morse.iamcanturk.dev · Repo: https://github.com/iamcanturk/morseforge
Prepared 2026-10-21. **Nothing has been posted.** Every outward step below is
Can's to take, one at a time.

## The idea in one paragraph

MorseForge is free, has no account, and its front page is the first lesson.
Its launch story is Can's own: he's learning to sail in Turkey, the course
needs an amateur radio certificate, that meant Morse, and the method that
worked for him became the app. Lead with the story where people read stories
(X, LinkedIn, Instagram), with the engineering where people read engineering
(HN, r/webdev, newsletters), and with a request for corrections where the
experts are (r/amateurradio, QRZ, clubs). Two loops are built into the
product: the seeded 60-second challenge link and the spoiler-free daily share.
The launch only has to get the first people to use them. No fake numbers, no
vote requests, no dark patterns.

## Order and dates

| Date (2026) | Time (Türkiye) | Channel | File |
| --- | --- | --- | --- |
| Thu 22 – Mon 26 Oct | — | Pre-launch checklist: phones, analytics baseline, Search Console, GitHub release draft | [checklist.md](checklist.md) |
| **Tue 27 Oct** | 15:30 (08:30 ET) | **Show HN** + first comment | [hacker-news.md](hacker-news.md) |
| Tue 27 Oct | ~17:30 | **X story thread** (EN) with the short 9:16 video | [story.md](story.md), [x-twitter.md](x-twitter.md) |
| Wed 28 Oct | 09:00 | **LinkedIn** (EN) | [linkedin.md](linkedin.md) |
| Wed 28 Oct | evening | r/morsecode | [reddit.md](reddit.md) |
| Thu 29 Oct | — | 🇹🇷 Cumhuriyet Bayramı: no Turkish posts. r/amateurradio (US audience) | [reddit.md](reddit.md) |
| Sat 31 Oct | afternoon | r/InternetIsBeautiful | [reddit.md](reddit.md) |
| **Mon 2 Nov** | 10:00 | **Turkish:** X thread + Instagram Reels + LinkedIn TR, TAMSAT/TRAC e-mails | [story.md](story.md), [turkish.md](turkish.md) |
| Mon 2 – Wed 4 Nov | — | QRZ, eHam, one club e-mail a day | [ham-radio.md](ham-radio.md) |
| Tue 3 Nov | 10:00 | DonanımHaber | [turkish.md](turkish.md) |
| **Thu 5 Nov** | 11:01 (00:01 PT) | **Product Hunt** (not Tue 3 Nov: US election day) | [product-hunt.md](product-hunt.md) |
| Sat 7 Nov | — | r/webdev Showoff Saturday | [reddit.md](reddit.md) |
| from Mon 9 Nov | — | Newsletters, directories, Astro showcase | [newsletters.md](newsletters.md) |
| ~Mon 16 Nov | — | Technical article ("Why your Morse code app is lying about its speed") | [newsletters.md](newsletters.md#a-technical-article) |

Why this order:
- **HN first,** on a Tuesday morning US time. It's the most honest test of
  whether the thing is good, and its comments fix the copy for every later
  channel.
- **Reddit spread out,** one sub a day, small and friendly before big and
  expert.
- **Turkish after the bayram,** when people are back at their screens.
- **Product Hunt last,** with a week of fixes behind it, on a day Can can
  spend in the comments.

## Channels at a glance

| Channel | Why it fits | Key rule | Copy |
| --- | --- | --- | --- |
| Show HN | No signup, try it in one tap, real engineering story | No vote requests, ever; post the first comment immediately | [hacker-news.md](hacker-news.md) |
| r/morsecode | Exactly the learners it's for | Say you made it; flair; ask where it gets in the way | [reddit.md](reddit.md) |
| r/amateurradio | The experts; Can is in training and wants corrections | *(verify)* self-promotion rule / weekly thread | [reddit.md](reddit.md) |
| r/InternetIsBeautiful | Free, single-purpose, no signup | *(verify)* 90/10 account rule, no hype title | [reddit.md](reddit.md) |
| r/webdev | Build story: ~6 KB content pages, islands | Saturday only *(verify)* | [reddit.md](reddit.md) |
| X | The story, the video, the share loops | Link in its own reply; alt text on images | [story.md](story.md) |
| LinkedIn | Story + product decisions; Can's professional network | Native video, three hashtags at most | [linkedin.md](linkedin.md) |
| Instagram | The Turkish story as a Reel | Link in bio, not caption | [story.md](story.md) |
| Product Hunt | General early adopters | Be present all day; no vote asks | [product-hunt.md](product-hunt.md) |
| QRZ / eHam / clubs | Credibility with operators | Ask for review, don't announce; never against their methods | [ham-radio.md](ham-radio.md) |
| TAMSAT / TRAC / DonanımHaber | Turkish operators and developers; Can's own context | Interface is English: say it; no Ekşi self-entries | [turkish.md](turkish.md) |
| Newsletters | Durable reach after the spike | One tailored tip each, with something new to point at | [newsletters.md](newsletters.md) |

## Everything in this folder

- [facts.md](facts.md): every claim the copy may make, with where it was
  checked, and the do-not-claim list.
- [story.md](story.md): Can's story; the X threads in TR and EN; the
  Instagram caption.
- Channel copy: [hacker-news.md](hacker-news.md) · [reddit.md](reddit.md) ·
  [x-twitter.md](x-twitter.md) · [product-hunt.md](product-hunt.md) ·
  [linkedin.md](linkedin.md) · [ham-radio.md](ham-radio.md) ·
  [turkish.md](turkish.md) · [newsletters.md](newsletters.md)
- [assets.md](assets.md): screenshots, the video, and what each channel
  needs. [assets/](assets/) holds 20 screenshots plus the PH thumbnail.
- [video/](video/): the promo script (approved), its build pipeline, and the
  renders (local only).
- [checklist.md](checklist.md): the pre-launch checks, verified live where
  possible; 👤 items are Can's.
- [post-launch.md](post-launch.md): the first 48 hours, objections and
  answers, feedback → issues.
- [github-release.md](github-release.md): v1.0.0 notes.
- [site-changes.md](site-changes.md): proposed site changes (none made).
- [tools/](tools/): the headless-Chrome scripts that made the screenshots and
  recordings.
- `.github/ISSUE_TEMPLATE/` (repo root): bug, on-air correction, "where I got
  stuck".

## Hard rules for whoever posts

1. Only facts from [facts.md](facts.md). If it isn't there, don't say it.
2. Never ask anyone to upvote, anywhere.
3. Say "I made this" every time.
4. Answer every comment in the first hours; turn every actionable one into an
   issue.
5. No numbers in public that you haven't published (visitors, signups). There
   are no signups.
