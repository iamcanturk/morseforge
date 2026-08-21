#!/usr/bin/env bash
#
# Deploy MorseForge to CloudPanel (morse.iamcanturk.dev).
#
# Requires the `morsecp` SSH alias — see docs/DEPLOYMENT.md for how it is set up.
# Nothing here is destructive to the server config: rsync only touches the
# document root, and --delete removes stale build artefacts from previous
# deploys, never anything outside dist/.

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

if [ ! -f dist/index.html ]; then
  echo "!! dist/index.html missing — refusing to deploy an empty build" >&2
  exit 1
fi

echo "==> Checking SSH access to ${REMOTE}"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" true 2>/dev/null; then
  echo "!! Cannot reach '${REMOTE}' over SSH. Check ~/.ssh/config." >&2
  exit 1
fi

echo "==> Syncing to ${REMOTE}:${REMOTE_PATH}"
rsync -avz --delete \
  --exclude '.well-known' \
  dist/ "${REMOTE}:${REMOTE_PATH}"

echo "==> Verifying live site"
status=$(curl -sS -o /dev/null -w '%{http_code}' "$SITE_URL/")
if [ "$status" != "200" ]; then
  echo "!! ${SITE_URL}/ returned HTTP ${status}" >&2
  exit 1
fi

echo "==> Deployed: ${SITE_URL}"
