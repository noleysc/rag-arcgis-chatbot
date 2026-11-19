"""Sync Village meeting videos (CHAMP) into data/meeting_videos/meetings.json.

Reads the public CHAMP archive list, then each board meeting held on or after
--since (default 2025-01-01, the first year with per-item timelines). A
meeting is re-fetched only when CHAMP's LastModify stamp changed, which is how
new meetings, and timelines added a day or two after a meeting, get picked up.
Each event fails independently: a failed fetch keeps the saved copy.

Items the Village didn't timestamp get an approximate start from the
meeting's caption transcript, else from the neighbouring items
(meeting_videos.fill_untimed). Only the computed seconds are saved.

Usage:
    python backend/scripts/sync_meeting_videos.py
    python backend/scripts/sync_meeting_videos.py --dry-run
    python backend/scripts/sync_meeting_videos.py --since 2026-01-01 --force
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import requests

from meeting_videos import (
    CAPTION_URL,
    CHAMP_API,
    MEETING_VIDEOS_FILE,
    VIDEO_SINCE,
    _is_full_meeting,
    fill_untimed,
    parse_event,
    parse_vtt,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; EngageEsteroBot/1.0)",
    # The API answers browser requests from the player's own origin.
    "Origin": "https://play.champds.com",
    "Accept": "application/json",
}
ARCHIVE_GROUP_ID = 1  # "Meetings", the archive's only group


def _get_json(url: str) -> object:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def caption_cues(raw: dict) -> list[tuple[int, str]] | None:
    """The meeting's English caption transcript, or None (soft-fails)."""
    caps = (raw.get("MediaInfo") or {}).get("Captions") or []
    path = next((c.get("MediaPath") for c in caps if c.get("LanguageID") == "en"), None)
    path = path or (caps[0].get("MediaPath") if caps else None)
    if not path:
        return None
    try:
        resp = requests.get(CAPTION_URL.format(path=path), headers={"User-Agent": HEADERS["User-Agent"]}, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"    captions unavailable ({exc})")
        return None
    return parse_vtt(resp.text) or None


def needs_fill(meeting: dict) -> bool:
    return any(s["start"] is None for s in meeting["segments"])


def load_saved(path: str) -> dict[int, dict]:
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return {int(m["event_id"]): m for m in json.load(f).get("meetings", [])}


def write_saved(path: str, meetings: dict[int, dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ordered = sorted(meetings.values(), key=lambda m: (m["date"], m["event_id"]))
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"source": f"{CHAMP_API}/archiveGroupListWithMedia/{ARCHIVE_GROUP_ID}", "meetings": ordered},
                  f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", default=VIDEO_SINCE, help="earliest meeting date (YYYY-MM-DD)")
    ap.add_argument("--out", default=MEETING_VIDEOS_FILE)
    ap.add_argument("--force", action="store_true", help="re-fetch every meeting")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=0.3, help="seconds between requests")
    args = ap.parse_args()

    try:
        listing = _get_json(f"{CHAMP_API}/archiveGroupListWithMedia/{ARCHIVE_GROUP_ID}")
    except (requests.RequestException, ValueError) as exc:
        print(f"Archive list fetch failed: {exc}")
        return 1
    events = [
        e for e in listing
        if str(e.get("EventDateTimeLocal") or "")[:10] >= args.since
        and _is_full_meeting(str(e.get("EventTitle") or ""))
        and e.get("MediaInfo")  # listed but no video yet (e.g. an upcoming meeting)
    ]
    saved = load_saved(args.out)
    print(f"{len(events)} board meeting video(s) since {args.since}; {len(saved)} saved")

    added = updated = failed = 0
    for e in events:
        eid = int(e["CustomerEventID"])
        prev = saved.get(eid)
        if prev and not args.force and prev.get("last_modified") == e.get("LastModifyDateTimeUTC"):
            continue
        try:
            raw = _get_json(f"{CHAMP_API}/event/{eid}")
            meeting = parse_event(raw)
        except (requests.RequestException, ValueError, KeyError) as exc:
            print(f"  ! event {eid}: {exc}")
            failed += 1
            continue
        finally:
            time.sleep(args.delay)
        if meeting is None:
            continue
        timed = sum(s["start"] is not None for s in meeting["segments"])
        estimated = 0
        if needs_fill(meeting):
            cues = caption_cues(raw)
            meeting["has_transcript"] = cues is not None
            estimated = fill_untimed(meeting, cues)
        print(f"  {'~' if prev else '+'} {meeting['date']} {meeting['title']} (event {eid}): "
              f"{timed}/{len(meeting['segments'])} agenda items timestamped, {estimated} estimated")
        saved[eid] = meeting
        if prev:
            updated += 1
        else:
            added += 1

    print(f"{added} new, {updated} updated, {failed} failed")
    if not args.dry_run and (added or updated or not os.path.exists(args.out)):
        write_saved(args.out, saved)
        print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
