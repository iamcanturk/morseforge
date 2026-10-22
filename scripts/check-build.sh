#!/usr/bin/env bash
#
# Assertions about the build output, as opposed to the source.
#
# Each of these guards a property no unit test can see, because each is a
# property of what actually gets deployed. Run by both the pre-push hook and CI,
# from this one file, so the two can never drift apart.
#
# Usage: bash scripts/check-build.sh [dist-dir]

set -euo pipefail

DIST="${1:-dist}"
failures=0

# GitHub Actions understands `::error::`; a plain terminal just prints it.
fail() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::$1"
  else
    echo "  FAIL  $1" >&2
  fi
  failures=$((failures + 1))
}

pass() { echo "  ok    $1"; }

if [ ! -d "$DIST" ]; then
  echo "No $DIST directory — run 'npm run build' first." >&2
  exit 1
fi

# --------------------------------------------------------------------------
# Pages must be real HTML without JavaScript.
#
# This is the GEO regression guard. GPTBot, ClaudeBot and PerplexityBot do not
# execute JavaScript, so a stray `output: 'server'` or a page turned into a
# client-only island makes the page invisible to them — and it would ship
# silently, costing months of indexing before anyone noticed.
# --------------------------------------------------------------------------
echo "Prerendered content:"
MIN_TEXT=500

# Every page here must exist and carry real text without JavaScript. These
# are the pages people land on from search and from shared links; a build that
# silently drops one of them is a failed build, not a skipped check.
REQUIRED_PAGES="
  index.html
  learn-morse-code-in-7-days/index.html
  morse-code-translator/index.html
  morse-code-alphabet/index.html
  words/sos/index.html
  message/index.html
  how-to-learn-morse-code/index.html
  morse-code-numbers/index.html
  morse-code-speed/index.html
"

for page in $REQUIRED_PAGES; do
  if [ ! -f "$DIST/$page" ]; then
    fail "$page was not generated"
    continue
  fi

  text=$(sed -e 's/<script[^>]*>.*<\/script>//g' "$DIST/$page" \
         | sed -e 's/<[^>]*>/ /g' | tr -s '[:space:]' ' ')

  if [ "${#text}" -lt "$MIN_TEXT" ]; then
    fail "$page has only ${#text} characters of text without JavaScript"
  else
    pass "$page — ${#text} characters"
  fi
done

# --------------------------------------------------------------------------
# PWA
# --------------------------------------------------------------------------
echo "PWA:"
[ -f "$DIST/manifest.webmanifest" ] && pass "manifest" || fail "no manifest"

if [ -f "$DIST/sw.js" ]; then
  # A worker that precaches itself pins the current build permanently: every
  # returning visitor keeps whichever version they first loaded, forever.
  if grep -q '"/sw.js"' "$DIST/sw.js"; then
    fail "the service worker precaches itself"
  else
    pass "service worker"
  fi
else
  fail "no service worker"
fi

# --------------------------------------------------------------------------
# Google Analytics stays behind consent (TASK-039)
#
# gtag.js may only ever be injected by the consent loader, after "Accept". A
# <script src="…googletagmanager…"> in the static HTML would load it for
# everyone, before any answer, and nothing in a unit test would notice. The
# secret-message page must carry no GA code at all, not even the loader: its
# message is in the URL fragment. The author's private tools carry none either.
# --------------------------------------------------------------------------
echo "Consent-gated analytics:"
static_tags=$(grep -rlE '<script[^>]*src="https://www\.googletagmanager\.com' "$DIST" --include='*.html' || true)
if [ -n "$static_tags" ]; then
  fail "gtag.js is in the static HTML of: $(echo "$static_tags" | sed "s|$DIST/||" | tr '\n' ' ')"
else
  pass "no page loads gtag.js before consent"
fi

if grep -q 'id="mf-consent"' "$DIST/index.html" 2>/dev/null; then
  pass "the consent bar and its loader are on /"
else
  fail "the consent bar is missing from / — GA could never be accepted"
fi

for page in message/index.html panel/index.html studio/index.html; do
  [ -f "$DIST/$page" ] || continue
  if grep -qE 'googletagmanager|gtag|morseforge_consent|mf-consent|G-[A-Z0-9]{10}' "$DIST/$page"; then
    fail "$page carries Google Analytics code or the consent bar"
  else
    pass "$page has no Google Analytics code"
  fi
done

# --------------------------------------------------------------------------
# Crawler endpoints
# --------------------------------------------------------------------------
echo "Crawler endpoints:"
for file in robots.txt llms.txt sitemap-index.xml; do
  [ -f "$DIST/$file" ] && pass "$file" || fail "$file missing"
done

if [ -f "$DIST/robots.txt" ]; then
  grep -q GPTBot "$DIST/robots.txt" \
    && pass "robots.txt names the AI crawlers" \
    || fail "robots.txt no longer names the AI crawlers"
fi

# --------------------------------------------------------------------------
# Machine-readable copies
#
# An assistant fetching an article should get clean Markdown rather than a
# document built for a browser. That only works if the alternates exist and the
# HTML says where they are — and a broken build of either is silent.
# --------------------------------------------------------------------------
echo "For assistants:"

if [ -f "$DIST/llms-full.txt" ]; then
  size=$(wc -c <"$DIST/llms-full.txt")
  if [ "$size" -gt 10000 ]; then
    pass "llms-full.txt — $size characters"
  else
    fail "llms-full.txt is only $size characters; something stopped generating"
  fi
else
  fail "llms-full.txt missing"
fi

markdown_count=$(find "$DIST/blog" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
post_count=$(find "$DIST/blog" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')

if [ "$markdown_count" -gt 0 ] && [ "$markdown_count" -eq "$post_count" ]; then
  pass "every post has a Markdown copy — $markdown_count of $post_count"
else
  fail "$markdown_count Markdown copies for $post_count posts"
fi

# The copy is useless if nothing points at it.
linked=$(grep -l 'rel="alternate" type="text/markdown"' "$DIST"/blog/*/index.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$linked" -eq "$post_count" ]; then
  pass "every post links its Markdown copy"
else
  fail "only $linked of $post_count posts link their Markdown copy"
fi

# The reference pages' copies, generated from data rather than written.
for file in morse-code-alphabet.md learn-morse-code-in-7-days.md; do
  [ -f "$DIST/$file" ] && pass "$file" || fail "$file missing"
done

word_pages=$(find "$DIST/words" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
word_markdown=$(find "$DIST/words" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [ "$word_markdown" -gt 0 ] && [ "$word_markdown" -eq "$word_pages" ]; then
  pass "every word page has a Markdown copy — $word_markdown of $word_pages"
else
  fail "$word_markdown Markdown copies for $word_pages word pages"
fi

# --------------------------------------------------------------------------
# SEO and GEO
#
# One visible H1, title and description lengths, self canonicals, JSON-LD that
# parses, noindex pages kept out of the sitemap, a dated sitemap, og:image
# files that exist, Markdown alternates that are Markdown, and the crawler
# files. Details and the rules are in scripts/check-seo.mjs.
# --------------------------------------------------------------------------
echo "SEO:"
if node "$(dirname "$0")/check-seo.mjs" "$DIST" >/tmp/morseforge-seo.$$ 2>/dev/null; then
  pass "$(tail -1 /tmp/morseforge-seo.$$)"
  # Pages whose sources are uncommitted have no lastmod yet: shown, not failed.
  grep '^WARN' /tmp/morseforge-seo.$$ | sed 's/^/  /' || true
else
  fail "$(tail -1 /tmp/morseforge-seo.$$)"
  grep '^FAIL' /tmp/morseforge-seo.$$ | head -40 >&2
fi
rm -f /tmp/morseforge-seo.$$

# --------------------------------------------------------------------------
# Internal links
#
# A broken internal link is invisible in development — you wrote it, so you
# know where it was meant to go — and it is the commonest way a static site
# rots. A crawler that follows one to a 404 learns the site is unmaintained.
# --------------------------------------------------------------------------
echo "Links:"
if node "$(dirname "$0")/check-links.mjs" "$DIST" >/tmp/morseforge-links.$$ 2>&1; then
  pass "$(tail -1 /tmp/morseforge-links.$$)"
else
  fail "$(head -1 /tmp/morseforge-links.$$)"
  sed -n '2,12p' /tmp/morseforge-links.$$ >&2
fi
rm -f /tmp/morseforge-links.$$

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures build check(s) failed." >&2
  exit 1
fi
echo "All build checks passed."
