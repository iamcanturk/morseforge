# Pre-launch checklist

✅ means verified on the live site from this session on **2026-10-21**.
👤 means only Can can do it (logins, uploads, real devices).
🔧 means a site change; nothing in `src/` was edited for the launch. See
[site-changes.md](site-changes.md).

Do the 👤 items by **Monday 26 October**, the day before Show HN.

## 1. Link cards (OG / Twitter)

- ✅ All main pages (`/`, `/challenge/`, `/daily/`, `/message/`,
  `/telegraph/`, `/learn/`) have `og:title`, `og:description`, `og:image`
  (1200×630 PNG, 90 KB), `og:image:alt`, `twitter:card=summary_large_image`,
  `twitter:site` and `twitter:creator` `@iamcanturk`, and a canonical.
- ✅ The card image `https://morse.iamcanturk.dev/og/default.png` answers 200
  `image/png` to Facebook's crawler.
- ✅ Link-preview crawlers get the page with its OG tags (HTTP 200): Twitterbot,
  facebookexternalhit, LinkedInBot, Slackbot, Discordbot, WhatsApp,
  TelegramBot. Cloudflare doesn't block any of them.
- ✅ A message link (`/message/#m=…`) unfurls as the generic message page. The
  fragment never reaches the crawler, as intended, so the preview can't leak
  the message.
- 🔧 Every page shares the same card image. A challenge link sent to a friend
  unfurls with the generic MorseForge card, not "a challenge". Fine for
  launch; per-route cards are proposal 1 in [site-changes.md](site-changes.md).
- 👤 Paste `https://morse.iamcanturk.dev/` into:
  - LinkedIn Post Inspector (linkedin.com/post-inspector, needs login), which
    also refreshes LinkedIn's cache;
  - the X post composer (draft, don't post) to see the card;
  - a WhatsApp message to yourself.

## 2. Share links on real phones 👤

Headless Chrome with a phone viewport and touch emulation rendered all of
these correctly (see `assets/*-1080x1350.png`). A real device is still the
only proof for the share sheet and audio. On one iPhone (Safari) and one
Android (Chrome):

- [ ] Front page: tap the key once → E, SIGNAL DETECTED. Sound plays after the
      first tap (iOS needs that user gesture; check the mute switch too).
- [ ] `/challenge/`: finish a run → **Challenge a friend** opens the native
      share sheet. Send it to yourself in WhatsApp and open it: "Someone sent
      you this run", SAME RUN.
- [ ] `/daily/`: play it, share the result. The text has squares, a percentage
      and the link, and no answers.
- [ ] `/message/`: write a message, create the link, send it to yourself, open
      it on the other phone, press Play. Tones and the tape light up together.
- [ ] `/telegraph/`: key SOS, then **Share** on the telegram card. The image
      attaches.
- [ ] Settings → Signal → Lamp: a listening drill flashes and is silent.
- [ ] Install to the home screen and open in airplane mode: the app loads.

Example links for testing:
- Challenge: `https://morse.iamcanturk.dev/challenge/?seed=k7f3&pool=14&time=60&wpm=20`
- Message: `https://morse.iamcanturk.dev/message/#m=V0hBVCBIQVRIIEdPRCBXUk9VR0hU&wpm=18`

## 3. Analytics

- ✅ The Cloudflare Web Analytics beacon is on the pages, and the CSP allows
  `static.cloudflareinsights.com` and `cloudflareinsights.com`.
- ✅ The first-party counter endpoint `/e/` answers `204`.
- ✅ `/panel/` answers `401` (password protected). `/panel/` and `/studio/` are
  disallowed in robots.txt.
- 👤 Log in to `/panel/` and to Cloudflare → Web Analytics the day before, so
  you know what "normal" looks like before the spike.
- 👤 Optional: in Cloudflare, set a notification for traffic anomalies or
  origin errors (Notifications → "Origin Error Rate" / "HTTP DDoS"), so a
  front-page spike that breaks something reaches you.

## 4. GitHub repo

- ✅ Description, homepage `https://morse.iamcanturk.dev`, MIT licence.
- ✅ 20 topics (amateur-radio, cw, ham-radio, learn-morse-code, morse-code,
  morse-code-trainer, pwa, astro, react, …).
- ✅ **Social preview is already set and is the current image.** The image
  GitHub serves is byte-for-byte `public/og/github-social.png` (same MD5). No
  upload needed. Re-upload only if that file changes.
- ✅ #43 (paddles/iambic) shipped and closed on 2026-10-21; #44 (translation
  plumbing) is closed too. The copy now presents paddles as a feature and
  "English only" as the one gap.
- ⚠️ **No release yet.** 👤 Create `v1.0.0` from the GitHub web UI on launch
  morning with the notes in [github-release.md](github-release.md) (the tag is
  an outward action, so Can does it).
- ⚠️ **Discussions are off and there are no issue templates.** Prepared in
  this branch: `.github/ISSUE_TEMPLATE/` (bug, on-air correction,
  "where I got stuck"). They go live when the branch is merged. Optional 👤:
  turn on Discussions (Settings → General → Features) for "how do I…"
  questions, so issues stay actionable.
- 🔧 The README's `git clone` and the two issue links, plus
  `package.json` `repository`/`bugs`, still say `iamcanturk/morse`. GitHub
  redirects, so nothing is broken, but the README is the page HN will read.
  Proposal 2 in [site-changes.md](site-changes.md).

## 5. README hero

- ✅ The hero image (`public/og/github-social.png`), tagline, the four "Open
  it / Learn in 7 days / 60-second challenge / Send a secret message" links
  and the badges render. The landing screenshot and the demo GIF are present.
- ✅ The README states test count, page count and JS weights with a dated
  measurement note, which matches [facts.md](facts.md).
- 👤 On launch morning, if anything shipped since the 21st, re-run the
  measurements in the README's HTML comment and update the badge.

## 6. Search engines 👤

The sitemap is `https://morse.iamcanturk.dev/sitemap-index.xml` (one child,
`sitemap-0.xml`, with 83 URLs). robots.txt points to it. No verification meta
tag is on the site; use DNS verification instead, which needs no deploy.

**Google Search Console**
1. search.google.com/search-console → **Add property** → **Domain** →
   `iamcanturk.dev` (if it isn't already there; a domain property covers the
   `morse.` subdomain).
2. Add the TXT record it gives you in Cloudflare DNS for `iamcanturk.dev`, then
   **Verify**.
3. **Sitemaps** → enter `https://morse.iamcanturk.dev/sitemap-index.xml` →
   Submit.
4. **URL inspection** → `https://morse.iamcanturk.dev/` → **Request indexing**.
   Repeat for `/learn-morse-code-in-7-days/`, `/challenge/`, `/daily/`,
   `/message/`, `/morse-code-alphabet/`.

**Bing Webmaster Tools** (also feeds DuckDuckGo and ChatGPT search)
1. bing.com/webmasters → **Import from Google Search Console** (fastest), or
   add the site and verify with a DNS CNAME/TXT.
2. **Sitemaps** → submit the same sitemap URL.
3. Optional: **IndexNow** is supported by Bing and Yandex. Not needed for
   launch.

## 7. Launch-day hygiene

- 👤 Don't deploy on launch morning. If a fix is needed, deploy it, then check
  the live site with the steps in the release flow before posting.
- 👤 Turn on GitHub notifications for issues on the repo (Watch → Custom →
  Issues), so reports reach you while you're in the HN thread.
- 👤 Have [post-launch.md](post-launch.md) open.
