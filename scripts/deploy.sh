#!/usr/bin/env bash
#
# Deploy MorseForge to CloudPanel (morse.iamcanturk.dev).
#
# Requires the `morsecp` SSH alias — see deploy/README.md for how it is set up.
# Nothing here is destructive to the server config: rsync only touches the
# document root, and --delete removes stale build artefacts from previous
# deploys, never anything outside dist/.
#
# panel/data.json is excluded because the server writes it, not the build —
# --delete would otherwise wipe the usage history on every deploy.

set -euo pipefail

REMOTE="${MORSEFORGE_REMOTE:-morsecp}"
REMOTE_PATH="${MORSEFORGE_REMOTE_PATH:-htdocs/morse.iamcanturk.dev/}"
SITE_URL="${MORSEFORGE_SITE_URL:-https://morse.iamcanturk.dev}"

cd "$(dirname "$0")/.."

echo "==> Verifying before deploy"
npm run typecheck
npm run test

echo "==> Building"
rm -rf dist
npm run build

echo "==> Checking the build"
bash "$(dirname "$0")/check-build.sh" dist

echo "==> Checking SSH access to ${REMOTE}"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" true 2>/dev/null; then
  echo "!! Cannot reach '${REMOTE}' over SSH. Check ~/.ssh/config." >&2
  exit 1
fi

echo "==> Syncing to ${REMOTE}:${REMOTE_PATH}"
rsync -avz --delete \
  --exclude '.well-known' \
  --exclude 'panel/data.json' \
  dist/ "${REMOTE}:${REMOTE_PATH}"

echo "==> Verifying live site"
status=$(curl -sS -o /dev/null -w '%{http_code}' "$SITE_URL/")
if [ "$status" != "200" ]; then
  echo "!! ${SITE_URL}/ returned HTTP ${status}" >&2
  exit 1
fi

# What the origin serves and what a crawler receives are not the same file.
# Cloudflare can prepend a managed block to robots.txt, and its default one
# disallows every AI crawler this site deliberately invites — silently
# reversing the whole GEO position while check-build.sh, which reads the built
# file, still passes. Warn rather than fail: it is a dashboard setting, and
# refusing to deploy would not fix it.
echo "==> Checking what crawlers actually receive"
served=$(curl -sS "$SITE_URL/robots.txt" || true)
if printf '%s' "$served" | grep -qiE '^user-agent: (GPTBot|ClaudeBot|CCBot|Google-Extended)' &&
  printf '%s' "$served" | grep -q 'Disallow: /$'; then
  echo "!! The served robots.txt disallows AI crawlers that this site allows."
  echo "   Something in front of the origin is rewriting it — check Cloudflare:"
  echo "   AI Crawl Control, and Settings → Manage robots.txt."
  echo "   Origin file is correct; see deploy/README.md."
fi

# The consent-gated Google Analytics loader (TASK-039) is in the build, but
# the CSP lives in the CloudPanel vhost, which this script cannot apply. A
# policy without googletagmanager.com blocks gtag silently for everyone who
# accepts. Warn rather than fail, as above: the fix is a paste in CloudPanel.
echo "==> Checking the Content-Security-Policy allows Google Analytics"
csp=$(curl -sSI "$SITE_URL/" | grep -i '^content-security-policy:' || true)
if [ -n "$csp" ] && ! printf '%s' "$csp" | grep -q 'googletagmanager.com'; then
  echo "!! The live CSP does not allow Google Analytics, so gtag is blocked."
  echo "   Paste deploy/cloudpanel-vhost.conf into CloudPanel → Vhost → Save."
  echo "   See \"GA4: paste the vhost\" in deploy/README.md."
fi

echo "==> Deployed: ${SITE_URL}"
