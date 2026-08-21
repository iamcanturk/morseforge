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
