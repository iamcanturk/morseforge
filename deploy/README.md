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

1. **AI Crawl Control** (formerly *Bots → AI Scrapers and Crawlers*) — set to
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

| | |
| --- | --- |
| `noindex` and `Disallow` | Keeps them out of search results. Not protection. |
| Not linked from anywhere | Keeps them out of the way. Not protection. |
| nginx basic auth | **This is the protection.** |

The password file is **not** created by any script here, deliberately. Set it
yourself:

```bash
ssh morsecp 'htpasswd -c ~/.htpasswd can'
```

If `htpasswd` is not installed:

```bash
ssh -t morsecp 'read -s -p "password: " p; echo; printf "can:%s\n" "$(openssl passwd -apr1 "$p")" > ~/.htpasswd; chmod 640 ~/.htpasswd; echo written'
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
