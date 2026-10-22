#!/usr/bin/env python3
"""Tally nginx's access log into the summary the panel reads.

There is no analytics service and no database behind these numbers. (Google
Analytics, which runs only for visitors who accept it, is separate and is not
read here.) Event beacons are answered by nginx with `204 No Content` and
nothing else, which means the access log already holds every number worth
having. This turns that log into JSON.

Two properties are load-bearing.

**Privacy.** Addresses are hashed with a salt that is regenerated every day and
never leaves the server, then counted only as hashes. Nothing that identifies a
person is written. Two visits on the same day collapse into one count; the same
person tomorrow does not, so nobody can be followed across days even by whoever
holds the output.

**Idempotence.** Each run recomputes whole days from the logs it can still see
and merges them over the previous summary, keeping older days untouched. The
logs rotate after a few days, so the summary — not the log — is the archive.
Running this twice an hour costs nothing; running it late loses nothing; a day
already summarised is never double counted.

    Install:  bash deploy/install-analytics.sh
    By hand:  ssh morsecp 'python3 ~/analytics/summarise.py'
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HOME = Path(os.environ.get("HOME", "."))
LOG_DIR = Path(os.environ.get("LOG_DIR", HOME / "logs" / "nginx"))
OUT_DIR = Path(os.environ.get("OUT_DIR", HOME / "analytics"))
OUT = Path(os.environ.get("OUT", OUT_DIR / "summary.json"))

# Where the panel reads it. Kept as a copy rather than as the only home: the
# deploy rsyncs the document root with --delete, and the archive of days the
# logs no longer reach must not depend on surviving that.
PUBLISH = Path(
    os.environ.get("PUBLISH", HOME / "htdocs" / "morse.iamcanturk.dev" / "panel" / "data.json")
)

# Long enough for a year of history at a few hundred bytes a day.
KEEP_DAYS = int(os.environ.get("KEEP_DAYS", "400"))

# The combined log format, plus the real client address Cloudflare appends.
LINE = re.compile(
    r"^(?P<remote>\S+) \S+ \S+ \[(?P<stamp>[^\]]+)\] "
    r'"(?P<method>[A-Z]+) (?P<path>[^" ]*)[^"]*" '
    r"(?P<status>\d{3}) \S+ "
    r'"(?P<referrer>[^"]*)" "(?P<agent>[^"]*)"'
    r'(?: "(?P<real>[^"]*)")?'
)

EVENT_NAME = re.compile(r"^[a-z_]{1,32}$")
EVENT_VALUE = re.compile(r"^[a-z0-9_-]{1,24}$")

# Anything that is a page rather than an asset: a directory path, or an .html.
PAGE = re.compile(r"^/[^?]*/$|\.html$")

# Obvious crawlers. Not a serious bot filter — Cloudflare's own analytics does
# that far better, which is why the panel links to it rather than pretending
# these numbers are clean.
BOT = re.compile(
    r"bot|crawl|spider|slurp|curl|wget|headless|monitor|uptime|preview|scan",
    re.IGNORECASE,
)


def daily_salt() -> bytes:
    """A salt that rolls at UTC midnight and is never part of the output."""
    path = OUT_DIR / ".salt"
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if path.exists():
        stored_day, _, stored_salt = path.read_text().partition("\n")
        if stored_day.strip() == today and stored_salt.strip():
            return stored_salt.strip().encode()

    salt = base64.b64encode(secrets.token_bytes(32)).decode()
    path.write_text(f"{today}\n{salt}\n")
    path.chmod(0o600)
    return salt.encode()


def visitor_id(address: str, date: str, salt: bytes) -> str:
    """A hash, so a visit can be counted without an address being kept."""
    return hashlib.blake2b(f"{address}|{date}".encode(), key=salt, digest_size=8).hexdigest()


def parse_date(stamp: str) -> str | None:
    """`22/Aug/2026:16:15:10 +0000` to `2026-08-22`, in UTC."""
    try:
        return (
            datetime.strptime(stamp, "%d/%b/%Y:%H:%M:%S %z")
            .astimezone(timezone.utc)
            .strftime("%Y-%m-%d")
        )
    except ValueError:
        return None


def log_files() -> list[Path]:
    """Current and rotated logs, so a run just after midnight still sees yesterday."""
    return sorted(LOG_DIR.glob("access.log*"))


class Day:
    __slots__ = ("visitors", "pageviews", "events", "pages", "referrers")

    def __init__(self) -> None:
        self.visitors: set[str] = set()
        self.pageviews = 0
        self.events: Counter[str] = Counter()
        self.pages: Counter[str] = Counter()
        self.referrers: Counter[str] = Counter()

    def to_json(self, date: str) -> dict[str, object]:
        return {
            "date": date,
            "visitors": len(self.visitors),
            "pageviews": self.pageviews,
            "events": dict(self.events.most_common()),
            # Capped: a long tail of one-hit paths would be most of the file
            # and none of the insight.
            "pages": dict(self.pages.most_common(40)),
            "referrers": dict(self.referrers.most_common(25)),
        }


def read_logs(salt: bytes) -> dict[str, Day]:
    days: dict[str, Day] = defaultdict(Day)

    for path in log_files():
        try:
            handle = path.open("r", errors="replace")
        except OSError:
            # A rotated file can vanish between the glob and the open.
            continue

        with handle:
            for line in handle:
                match = LINE.match(line)
                if not match:
                    continue

                date = parse_date(match["stamp"])
                if date is None:
                    continue

                request_path = match["path"]

                # The author's own tools are not traffic.
                if request_path.startswith(("/panel", "/studio")):
                    continue

                day = days[date]

                if request_path.startswith("/e/?"):
                    record_event(day, request_path)
                    continue

                if BOT.search(match["agent"] or ""):
                    continue
                if int(match["status"]) >= 400:
                    continue
                if not PAGE.search(request_path.split("?", 1)[0]):
                    continue

                clean = request_path.split("?", 1)[0]
                if len(clean) > 120:
                    continue

                day.pageviews += 1
                day.pages[clean] += 1

                address = match["real"] or match["remote"]
                day.visitors.add(visitor_id(address, date, salt))

                record_referrer(day, match["referrer"])

    return days


def record_event(day: Day, request_path: str) -> None:
    query = request_path.split("?", 1)[1] if "?" in request_path else ""
    fields = dict(
        pair.split("=", 1) for pair in query.split("&") if "=" in pair
    )

    name = fields.get("n", "")
    if not EVENT_NAME.match(name):
        return

    value = fields.get("v", "")
    key = f"{name}={value}" if EVENT_VALUE.match(value) else name
    day.events[key] += 1


def record_referrer(day: Day, referrer: str) -> None:
    if not referrer or referrer == "-":
        return

    host = re.sub(r"^https?://", "", referrer).split("/", 1)[0].lower()
    # Our own pages are not a referrer worth reporting.
    if not host or "morse.iamcanturk.dev" in host:
        return
    if re.fullmatch(r"[a-z0-9.:-]{1,64}", host):
        day.referrers[host] += 1


def merge(previous: list[dict[str, object]], fresh: dict[str, Day]) -> list[dict[str, object]]:
    """Recomputed days win; days the logs no longer reach are carried through."""
    by_date = {str(entry.get("date")): entry for entry in previous if entry.get("date")}
    for date, day in fresh.items():
        by_date[date] = day.to_json(date)

    return sorted(by_date.values(), key=lambda entry: str(entry["date"]), reverse=True)[:KEEP_DAYS]


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not log_files():
        print(f"no access logs under {LOG_DIR}", file=sys.stderr)
        return 1

    previous: list[dict[str, object]] = []
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text()).get("days", [])
        except (json.JSONDecodeError, OSError):
            # A corrupt summary is worth losing rather than crashing on; the
            # recent days are about to be rebuilt from the logs anyway.
            previous = []

    days = merge(previous, read_logs(daily_salt()))

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "days": days,
    }

    # Written aside and moved into place, so a failure never leaves the panel
    # reading half a file.
    temporary = OUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")))
    temporary.chmod(0o644)
    temporary.replace(OUT)

    # Published beside the panel so it works without any nginx aliasing. It
    # holds no addresses and no user agents by construction, but nginx still
    # puts the whole /panel/ prefix behind a password.
    if PUBLISH.parent.is_dir():
        published = PUBLISH.with_suffix(".json.tmp")
        published.write_text(OUT.read_text())
        published.chmod(0o644)
        published.replace(PUBLISH)
    else:
        print(f"note: {PUBLISH.parent} does not exist, so nothing was published", file=sys.stderr)

    print(f"wrote {OUT} — {len(days)} days, {OUT.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
