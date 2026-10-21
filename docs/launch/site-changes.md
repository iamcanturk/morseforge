# Site changes the launch would benefit from

Nothing here was changed. `src/` is out of scope for the launch session, and
another session is working on #43/#44 in `src/` right now. Each item says who
should do it and whether it blocks the launch.

## 1. Per-route link cards (nice to have, not blocking)

Every page uses `og/default.png`. The 60-second challenge is the growth loop
(PROJECT.md §36–37), yet a challenge link pasted into WhatsApp or X unfurls as
the generic MorseForge card. Static, build-time cards per route would make
the shared link say what it is, with no server:

- `/challenge/`: "60 seconds. Same characters, same order. Beat it?"
- `/daily/`: "Daily wire: the same 8 lines for everyone"
- `/message/`: "Someone sent you a message in Morse" (generic on purpose:
  the fragment never reaches the crawler)
- `/telegraph/`: the brass key

`npm run brand` already draws the social cards from the palette, so this is
probably an extension of `scripts/make-brand.mjs` plus one field in the page
registry. A per-*score* card would need a server or an edge function. That's
out of scope, and it would also contradict "no backend".

## 2. Old repository name (README and package.json done)

The repo was renamed to `iamcanturk/morseforge`. Fixed in this branch:
`README.md` (clone command, issue links #43/#44) and `package.json`
(`repository`, `bugs`).

**Still open:** `src/config/site.ts` → `repo: 'https://github.com/iamcanturk/morse'`,
which the site uses for its GitHub links. GitHub redirects, so nothing is
broken. It's under `src/` (another session is working there on #43/#44) and
only goes live with a deploy, so change it in the next release.

## 3. Release version (small)

`package.json` is `0.1.0`. If you tag `v1.0.0`, bump it in the same commit.

## 4. Things checked and found fine (no change needed)

- Security headers (CSP, HSTS preload, Referrer-Policy, Permissions-Policy)
  are present on normal pages.
- The landing hero, the challenge link, the message link and the telegraph all
  work with a phone viewport and touch emulation.
- robots.txt allows every major and AI crawler and points to the sitemap.
