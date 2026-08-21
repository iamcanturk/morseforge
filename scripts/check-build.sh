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

for page in \
  index.html \
  learn-morse-code-in-7-days/index.html \
  morse-code-translator/index.html \
  morse-code-alphabet/index.html \
  words/sos/index.html
do
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

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures build check(s) failed." >&2
  exit 1
fi
echo "All build checks passed."
