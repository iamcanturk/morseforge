# Deployment

Static files on CloudPanel, behind Cloudflare.

```bash
npm run deploy
```

That verifies, builds, runs `scripts/check-build.sh` against the output, rsyncs
to the server and asserts the site responds. It refuses to ship a build that
fails any of those.

## Server

|           |                                                    |
| --------- | -------------------------------------------------- |
| Host      | CloudPanel static site, `morse.iamcanturk.dev`     |
| SSH alias | `morsecp`                                          |
| Web root  | `~/htdocs/morse.iamcanturk.dev`                    |
| TLS       | Let's Encrypt, issued through the Cloudflare proxy |

## nginx

[`cloudpanel-vhost.conf`](cloudpanel-vhost.conf) is the vhost template. Apply it
in CloudPanel: **Sites → morse.iamcanturk.dev → Vhost → paste → Save**. The
`{{...}}` placeholders are CloudPanel's own; leave them alone.

It is version-controlled because CloudPanel's default static template breaks the
PWA in a way that is invisible until it bites: `sw.js` matches the generic `.js`
rule and is served with a ten-year expiry, so every returning visitor stays
pinned to whichever build they first loaded.

## Cloudflare

Two settings that nginx cannot fix from the origin, because Cloudflare
overrides the origin on both.

### 1. Browser Cache TTL

**Caching → Configuration → Browser Cache TTL → Respect Existing Headers**

The default is 4 hours, and it rewrites the `Cache-Control` sent to browsers
regardless of what the origin says. With it on, `sw.js` goes out as
`max-age=14400` even though nginx sends `no-cache`.

### 2. Bypass the edge cache for the service worker

**Caching → Cache Rules → Create rule**

- Name: `Bypass cache for service worker`
- When: `URI Path` `equals` `/sw.js`
- Then: **Bypass cache**

The vhost also sends `CDN-Cache-Control: no-store`, which Cloudflare honours at
the edge, but the explicit rule is what makes it unambiguous.

### After changing either

**Caching → Configuration → Purge Everything.** Existing edge copies keep their
old headers until they expire, which for `sw.js` was set to the year 2037.

### Verifying

```bash
curl -sSI "https://morse.iamcanturk.dev/sw.js?bust=$RANDOM" | grep -i cache-control
```

Should print `no-cache, must-revalidate`. If it prints `max-age=14400`, Browser
Cache TTL is still overriding. If a plain request (no `?bust=`) still shows
`max-age=315360000`, the edge cache has not been purged.

## Why this matters

The service worker decides which build every returning visitor sees. Cached
wrongly, it is not a slow update — it is no update, permanently, for anyone who
has already visited.

---

## Cloudflare is rewriting robots.txt

Found on 2026-08-22, and not by a report — nothing on the origin looks wrong.

Cloudflare prepends a **managed content block** to `robots.txt` before it
reaches a crawler. Its default policy disallows every AI crawler this site
deliberately invites:

```
# BEGIN Cloudflare Managed content
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: ClaudeBot
Disallow: /

User-agent: GPTBot
Disallow: /
...
```

Our own block follows underneath with `Allow: /` for the same agents. Under
RFC 9309 an equally specific `Allow` beats a `Disallow`, so a strict reader
still crawls — but plenty of crawlers take the first matching group and stop,
and the `Content-Signal: ai-train=no` is a statement made on our behalf that
contradicts the site's stated position.

`scripts/check-build.sh` cannot catch this: it reads the built file, which is
correct. `scripts/deploy.sh` now fetches the live URL and warns.

### The fix, in the dashboard

1. **AI Crawl Control** (formerly _Bots → AI Scrapers and Crawlers_) — set to
   **Allow**, or turn the block off for this zone.
2. **Settings → Manage robots.txt** — turn the managed file **off**, so the
   origin's own `robots.txt` is served unmodified.

Then confirm:

```bash
curl -s https://morse.iamcanturk.dev/robots.txt | head -5
```

The first line should be `# MorseForge — free Morse code trainer`.

---

## The private pages

`/panel/` and `/studio/` are the author's own tools. Three things keep them
private, and only one of them is protection:

|                          |                                                   |
| ------------------------ | ------------------------------------------------- |
| `noindex` and `Disallow` | Keeps them out of search results. Not protection. |
| Not linked from anywhere | Keeps them out of the way. Not protection.        |
| nginx basic auth         | **This is the protection.**                       |

The password file is **not** created by any script here, deliberately. Set it
yourself:

```bash
ssh -t morsecp 'htpasswd -c ~/.htpasswd can && chmod 644 ~/.htpasswd'
```

**The `-t` is not optional.** `htpasswd` prompts for the password, and `ssh`
does not allocate a terminal for a one-shot command unless told to. Worse than
failing, it _succeeds_: with no terminal to read from it takes end-of-file as
the answer and writes an entry with an **empty password**, exit code 0, no
warning. Verify afterwards rather than assuming:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -u can: https://morse.iamcanturk.dev/panel/
```

`401` means an empty password is refused, which is what you want. `200` means
the file was written without one — delete it and set it again.

If `-t` still gives "Pseudo-terminal will not be allocated", you are running it
from something that is not a terminal. Log in and run it there instead:

```bash
ssh morsecp
htpasswd -c ~/.htpasswd can
chmod 644 ~/.htpasswd
exit
```

Then paste `cloudpanel-vhost.conf` into **CloudPanel → Sites →
morse.iamcanturk.dev → Vhost → Save**. That is also what turns on `/e/`, the
event endpoint the panel counts from — until it is applied, the beacons 404 and
the panel shows pageviews only.

## Usage summary

`summarise.py` runs on the server every 20 minutes and tallies nginx's own
access log into JSON. Install or update it with:

```bash
bash deploy/install-analytics.sh
```

It writes two copies: `~/analytics/summary.json` is the archive, kept outside
the document root so `rsync --delete` cannot take the history; the panel reads
a published copy at `panel/data.json`, which the deploy excludes for the same
reason.

Addresses are hashed with a salt that rolls daily and is never stored in the
output, so the summary holds no addresses, no user agents and no individual
paths.

---

## Markdown alternates need a MIME type

nginx has no type for `.md` and serves it as `application/octet-stream`, which
makes a browser download the file rather than display it. Every article links
its Markdown copy with `rel="alternate"`, so the type has to be right or the
arrangement is decorative.

The `location ~* \.md$` block in `cloudpanel-vhost.conf` fixes it. Confirm with:

```bash
curl -sI https://morse.iamcanturk.dev/blog/sos-does-not-stand-for-anything.md | grep -i content-type
```

It should say `text/markdown`, not `application/octet-stream`.

---

## Security headers, and the nginx trap that hid them

The five security headers are declared at the server level **and repeated in
every location that serves a document**. That repetition is not sloppiness.

nginx inherits `add_header` from an outer block into a `location` only if that
location declares no `add_header` of its own — and when it does declare one, it
drops _all_ the inherited ones, not just any that clash. Every location in this
vhost sets a `Cache-Control`, so a first attempt with the headers declared once
at the server level produced this:

```
$ curl -sI https://morse.iamcanturk.dev/ | grep -i strict-transport
                                    # nothing

$ curl -sI https://morse.iamcanturk.dev/no-such-page/ | grep -i strict-transport
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

Present on the 404 — which matches no location with an `add_header` — and
absent everywhere a visitor would actually go. `always` does not help: it
governs whether a header is added to error responses, not inheritance.

Documents get the full set. Assets get only HSTS and `nosniff`, because a
Content-Security-Policy on a stylesheet response accomplishes nothing.

Confirm after applying:

```bash
curl -sI https://morse.iamcanturk.dev/ | grep -iE 'strict-transport|content-security|referrer-policy|nosniff'
```

All four should appear. If the site breaks instead, remove the
`Content-Security-Policy` lines first — that is the only one that can stop a
page working.

---

## The redesign release: operational notes

What changes for the server, and what does not.

### No vhost change is required

The new pages need nothing the current Content-Security-Policy refuses. Share
cards are drawn on a canvas and handed to the browser as `blob:` URLs, which
`img-src` already allows; the inline scripts the layout and a few pages use are
covered by `'unsafe-inline'`; the usage counter calls `/e/` on the same origin.
Removing `'unsafe-inline'` (hashing or nonce-ing those scripts) is a worthwhile
hardening, but it is future work, not a condition of this release.

Two optional additions follow. Neither blocks the deploy.

### Optional: redirect `/index.html` to `/`

`/index.html` and `/x/index.html` serve the same document as `/` and `/x/`. The
canonical tag already tells search engines which one counts, so this is
tidiness rather than a fix. If you want it, paste this at server level, just
above the first `location`:

```nginx
# /index.html and /x/index.html duplicate / and /x/. 301 to the slash URL,
# keeping any query string. Tested on $request_uri (what the client asked
# for), so the index module's internal /x/ -> /x/index.html never matches.
if ($request_uri ~ "^(.*/)index\.html(\?.*)?$") {
  return 301 $1$2;
}
```

It has to test `$request_uri`, not a `location ~ /index\.html$`: the `index`
directive's internal redirect from `/x/` to `/x/index.html` would match such a
location and loop. A server-level `if` that only `return`s declares no
`add_header`, so it inherits the server block's security headers. Confirm:

```bash
curl -sI https://morse.iamcanturk.dev/index.html | grep -iE '^(HTTP|location|strict-transport)'
curl -sI https://morse.iamcanturk.dev/words/sos/index.html | grep -iE '^(HTTP|location)'
```

Expect a `301` with `Location: /` (and `/words/sos/`), and the HSTS header on
the first. If the headers are missing, use a `location = /index.html { … }`
that repeats the security `add_header` lines instead, like every other location
here does.

Separately, the crawler-file location (`^/(robots\.txt|llms\.txt|sitemap.*\.xml)$`)
does not match `/llms-full.txt`, so that file gets the generic caching rules.
Widening it to `llms(-full)?\.txt` makes it behave like its sibling.

### Regenerating the brand assets

```bash
npm run brand
```

`scripts/make-brand.mjs` redraws the favicon, the touch and PWA icons and both
social cards (`public/og/default.png`, `public/og/github-social.png`) from
`src/styles/palette.ts`, the logo geometry and `src/config/site.ts`. It is
deterministic: two runs give byte-identical files. It rasterises with `sharp`,
which is pinned as a `devDependency`.

The logo is the Split M plus the wordmark. The mark is geometry in
`src/components/brand/mark.ts`; the wordmark is Space Grotesk traced to outlines
in `src/components/brand/wordmarkOutline.ts`, so nothing at runtime needs the
font. That file is generated, not edited: `node scripts/trace-wordmark.mjs`
rewrites it, and it only needs running if the name or the display font changes.
The tracer reads the font through `fontkitten`, which arrives transitively with
Astro and is patched in memory by `scripts/brand-type.mjs`; the script fails
loudly if a patch stops matching after an upgrade.

The README hero is `public/og/github-social.png`; GitHub's own social preview is
set by hand under **Settings → General → Social preview**, and has to be
re-uploaded after the card changes.

### `lastmod` comes from git

Every `<lastmod>` in the sitemap is the date of the last commit that touched the
files a page is built from (blog posts use their frontmatter dates). The build
time is never used, which is what keeps the sitemap identical across two builds
of the same commit.

So **build after committing**. A page whose sources are uncommitted gets no
`<lastmod>` rather than a wrong one, and `scripts/check-seo.mjs` prints a
`WARN … sources are uncommitted` line for each. `npm run deploy` does not check that
the tree is clean, so commit first: otherwise the deploy ships undated URLs, which
is harmless to crawlers but throws the freshness signal away.
