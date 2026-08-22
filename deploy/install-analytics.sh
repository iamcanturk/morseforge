#!/usr/bin/env bash
#
# Install the usage summariser on the server.
#
# Copies deploy/summarise.py into ~/analytics, runs it once, and schedules it.
# Safe to re-run: it overwrites the script and rewrites its own crontab line
# without touching any other.
#
# It deliberately does NOT set the password. That is the one step only you can
# do — see the note it prints at the end.
#
#   bash deploy/install-analytics.sh

set -euo pipefail

REMOTE="${MORSEFORGE_REMOTE:-morsecp}"
CRON_MARKER="# morseforge-analytics"

cd "$(dirname "$0")/.."

echo "==> Checking SSH access to ${REMOTE}"
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" true 2>/dev/null; then
  echo "!! Cannot reach '${REMOTE}' over SSH. Check ~/.ssh/config." >&2
  exit 1
fi

echo "==> Copying the summariser"
ssh "$REMOTE" 'mkdir -p ~/analytics && chmod 700 ~/analytics'
scp -q deploy/summarise.py "${REMOTE}:analytics/summarise.py"
ssh "$REMOTE" 'chmod 700 ~/analytics/summarise.py'

echo "==> Running it once"
ssh "$REMOTE" 'python3 ~/analytics/summarise.py'

echo "==> Scheduling it every 20 minutes"
# Rewritten rather than appended, so re-running this never stacks up copies.
ssh "$REMOTE" "
  ( crontab -l 2>/dev/null | grep -v '${CRON_MARKER}' || true
    echo '*/20 * * * * /usr/bin/python3 \$HOME/analytics/summarise.py >/dev/null 2>&1 ${CRON_MARKER}'
  ) | crontab -
  crontab -l | grep '${CRON_MARKER}'
"

echo
echo "==> Done. The summary is at ~/analytics/summary.json on the server."
echo
if ssh "$REMOTE" 'test -f ~/.htpasswd'; then
  echo "    A password file is already in place."
else
  cat <<'NOTE'
    One step left, and it is yours: the password.

    Run this yourself — it prompts for a password, and it is deliberately not
    something this script or anyone else does on your behalf:

      ssh -t morsecp 'htpasswd -c ~/.htpasswd can && chmod 644 ~/.htpasswd'

    The -t matters. htpasswd prompts, and ssh gives a one-shot command no
    terminal unless told to. Without one htpasswd does not fail — it reads
    end-of-file as the password and writes an EMPTY one, exit code 0.

    Check it took, rather than assuming:

      curl -s -o /dev/null -w '%{http_code}\n' -u can: https://morse.iamcanturk.dev/panel/

    401 means an empty password is refused. 200 means there is no password.

    Then paste deploy/cloudpanel-vhost.conf into
    CloudPanel → Sites → morse.iamcanturk.dev → Vhost → Save.

    Until both are done, /panel/ and /studio/ are reachable by anyone who
    guesses the URL.
NOTE
fi
