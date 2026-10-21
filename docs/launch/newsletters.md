# Newsletters, directories and the follow-up article

Newsletters pick what they like; you can only make it easy. Send one short
tip each, in the week after Show HN (from Mon 9 Nov), when there's something
real to point at: the HN thread, a corrected on-air page, the article.

Check each one's submission page on the day. Several take tips only by e-mail
or by a form, and some don't take submissions at all. Don't send the same text
to all of them.

## Developer newsletters

| Newsletter | Angle | How |
| --- | --- | --- |
| **Frontend Focus / JavaScript Weekly** (Cooperpress) | The JS budget split: ~6 KB content pages, React islands only where interactive; Web Audio timing | Their "submit a link" form or reply-to address |
| **Astro newsletter / Astro showcase** | A real Astro 7 site with React islands, prerendered and PWA | astro.build/showcase has a submission form, which is also a permanent backlink |
| **Sidebar.io** | Design: the telegraph/CRT design system, palette tested for 4.5:1 contrast in both themes | Submission form |
| **Hacker Newsletter** | Curated from HN, no submissions. Only if the Show HN does well | Nothing to do |
| **Console.dev** | Open-source developer tools. Only a fit if pitched as "how it's built" | Their form |

**Tip text (example for Cooperpress):**

> MorseForge is a free Morse code trainer built on Astro 7. The reference pages
> ship ~6 KB of JS, and only the interactive screens hydrate React islands.
> The tone and the visual "lamp" run on one Web Audio timeline. MIT:
> https://github.com/iamcanturk/morseforge, live at https://morse.iamcanturk.dev

## Ham radio news

| Outlet | How |
| --- | --- |
| **Amateur Radio Newsline** | Takes news tips by e-mail. Pitch only if a club or operators endorsed it, not as a product launch |
| **ARRL** (The ARRL Letter, QST "Product Review" is for hardware) | ARRL news tips address. Low odds; send one line |
| **Club newsletters** (via the club e-mails in [ham-radio.md](ham-radio.md)) | Best odds. A club that likes it mentions it in its own newsletter |

## Directories (permanent links, low effort)

- **AlternativeTo:** list it as an alternative to LCWO and other trainers,
  honestly described.
- **GitHub topics:** done (20 topics, see [checklist.md](checklist.md)).
- **Astro showcase:** see above.
- **Awesome lists:** there are "awesome amateur radio" lists on GitHub. Open a
  PR adding one line in the right section, following each list's format and
  contribution rules.

## A technical article

One or two weeks after launch, once you know which questions people actually
asked. Publish on iamcanturk.dev first (canonical), then cross-post to dev.to
or Hashnode with the canonical URL set.

**Title options**

1. *Why your Morse code app is lying about its speed*: PARIS is exactly 50
   units, most implementations hardcode a dot and drift, here's the test that
   pins it, and what Farnsworth does to the 31 keying and 19 spacing units.
2. *A key a beginner can use*: why keying patience can't be derived from WPM,
   and how "commit the instant it can't be anything else" feels to a learner.
3. *The URL fragment as a free, serverless share channel*: secret messages and
   seeded challenge links with no backend, and what that does and doesn't
   protect.

Recommendation: **1** for HN and r/amateurradio, **3** for web newsletters.
