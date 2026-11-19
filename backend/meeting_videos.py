"""Timestamped meeting-video links for board agenda items.

The Village streams and archives its meetings on CHAMP (play.champds.com).
Each archived meeting has a public JSON record with the agenda tree plus a
timeline of start/end seconds per agenda item, which the player itself uses
for its "jump to item" links. backend/scripts/sync_meeting_videos.py saves
those records (2025 on, the first year the Village added timelines) to
data/meeting_videos/meetings.json.

At runtime a board record is matched to the agenda item it was discussed
under: same board and meeting date, then the same resolution/ordinance number,
else a near-identical title. A record with no confident match gets no link:
a link to the wrong discussion is worse than none, and a whole-meeting video
doesn't help anyone find the item.

Kept out of the gold CSV on purpose: the segments never enter the search
index, so adding or refreshing videos cannot change retrieval.
"""
from __future__ import annotations

import bisect
import datetime
import html
import json
import os
import re
import threading
from dataclasses import asdict, dataclass
from typing import Any

from config import DATA_DIR

CHAMP_API = "https://playapi.champds.com/esterofl"
PLAYER_URL = "https://play.champds.com/esterofl/event/{event_id}"
MEETING_VIDEOS_FILE = os.getenv(
    "MEETING_VIDEOS_FILE", os.path.join(DATA_DIR, "meeting_videos", "meetings.json")
)
# CHAMP has video from Dec 2020, but per-item timelines only from 2025.
VIDEO_SINCE = "2025-01-01"

# Same thresholds the offline check against 2025-26 records was run with
# (see tests/test_meeting_videos.py for the cases they have to separate).
TITLE_MATCH_MIN = 0.6
TITLE_SHARED_MIN = 2
# How far a record's date may sit from its meeting's for an item match.
NEARBY_DAYS = 3

_STOP = set(
    "the of and a an to for in on with by at from village council estero no resolution "
    "ordinance approval approve approving item items fl florida".split()
)
_MONTHS = set(
    "january february march april may june july august september october november december".split()
)
# "Resolution No. 2025-22", "Ordinance 2025 - 05", "Zoning Ordinance No. 2024-14".
_REF_RE = re.compile(
    r"\b(resolution|ordinance)?(?:\s+no\.?)?\s*(20\d\d)\s*[-–]\s*(\d{1,3})(?!\d)", re.IGNORECASE
)
_TAG_RE = re.compile(r"<[^>]+>")
# Abbreviations the Village's video agendas use where the minutes spell the
# words out ("Proposed CIP" vs "Five-Year Capital Improvement Plan Review").
_ABBREVIATIONS = {
    "cip": ("capital", "improvement"),
    "cmar": ("construction", "manager", "risk"),
    "uep": ("utility", "extension", "project"),
    "p3": ("public", "private", "partnership"),
    "bert": ("bonita", "estero", "rail", "trail"),
}
# Minutes note when an item was pulled: "… - DELETED FROM AGENDA",
# "… Removed from Agenda". Such an item was never discussed; the only video
# of it is the agenda-approval vote that removed it.
_REMOVED_RE = re.compile(
    r"[\s.,;:–-]*\b(?:deleted|removed|pulled|withdrawn)\s+from\s+(?:the\s+)?agenda\b.*$",
    re.IGNORECASE,
)
_AGENDA_APPROVAL_RE = re.compile(r"\bapproval of (?:the )?agenda\b", re.IGNORECASE)


def board_key(name: str) -> str | None:
    """'vc' / 'pz' for a gold Board value or a CHAMP event title."""
    low = (name or "").lower()
    if "planning" in low or "zoning" in low or "design board" in low:
        return "pz"
    if "council" in low:
        return "vc"
    return None


def _is_full_meeting(title: str) -> bool:
    """CHAMP also lists short highlight clips and staff trainings."""
    low = (title or "").lower()
    return board_key(title) is not None and "clip" not in low and "training" not in low


def _tokens(text: str) -> set[str]:
    # Numbers are kept at any length: "Change Order No. 2" vs "No. 3".
    out: set[str] = set()
    for w in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if w in _ABBREVIATIONS:
            out.update(_ABBREVIATIONS[w])
        elif w not in _STOP and (len(w) > 2 or w.isdigit()):
            out.add(w)
    return out


def removed_from_agenda(title: str) -> tuple[str, bool]:
    """(title without the removal note, whether the item was removed)."""
    stripped = _REMOVED_RE.sub("", title or "")
    return stripped, stripped != (title or "")


def _distinct(tokens: set[str]) -> set[str]:
    """Tokens that tell two otherwise-identical titles apart: dates and
    numbers ("May 7, 2025 Minutes" vs "April 16, 2025 Minutes")."""
    return {t for t in tokens if t in _MONTHS or any(c.isdigit() for c in t)}


def refs(text: str) -> set[tuple[str, str, str]]:
    """(kind, year, number) references, kind '' when unstated."""
    return {
        ((m.group(1) or "").lower(), m.group(2), str(int(m.group(3))))
        for m in _REF_RE.finditer(text or "")
    }


def _refs_agree(a: set[tuple[str, str, str]], b: set[tuple[str, str, str]]) -> bool:
    for ka, ya, na in a:
        for kb, yb, nb in b:
            if ya == yb and na == nb and (not ka or not kb or ka == kb):
                return True
    return False


def _lead(title: str) -> str:
    """The item's name: text before the first "(" (district, application
    status) that starts the run-on description."""
    return (title or "").split("(", 1)[0]


def _overlap(ta: set[str], tb: set[str]) -> float:
    if not ta or not tb:
        return 0.0
    if ta == tb:
        return 1.0
    shared = ta & tb
    if len(shared) < TITLE_SHARED_MIN:
        return 0.0
    return len(shared) / min(len(ta), len(tb))


def title_overlap(a: str, b: str) -> float:
    """How alike two agenda titles are (0–1): the better of the whole-title
    and lead-only token overlap. 0 when the leads disagree on a date or
    number, or share fewer than TITLE_SHARED_MIN tokens.

    Agenda titles often run on into a description, and the Village's and the
    minutes' descriptions differ ("… 19975 S. Tamiami Trail" vs "Continued
    from the February 10th meeting"), so the lead (the item's name) is scored
    on its own and its numbers are the only ones that can veto a match.
    """
    lead_a, lead_b = _tokens(_lead(a)), _tokens(_lead(b))
    da, db = _distinct(lead_a), _distinct(lead_b)
    if (da - db) and (db - da):
        return 0.0
    return max(_overlap(_tokens(a), _tokens(b)), _overlap(lead_a, lead_b))


def parse_event(raw: dict[str, Any]) -> dict[str, Any] | None:
    """One CHAMP event JSON → the compact meeting record we store, or None
    for clips, trainings, and other non-board events."""
    event = raw.get("Event") or {}
    title = str(event.get("EventTitle") or "").strip()
    if not _is_full_meeting(title):
        return None
    event_id = int(event["CustomerEventID"])
    spans: dict[int, tuple[int, int]] = {}
    for t in raw.get("Timeline") or []:
        # ContainerTypeID 2 = agenda item; others are free-form index points.
        if t.get("ContainerTypeID") == 2 and t.get("TimeStartSeconds") is not None:
            spans[int(t["ContainerID"])] = (int(t["TimeStartSeconds"]), int(t.get("TimeEndSeconds") or 0))

    segments: list[dict[str, Any]] = []

    def walk(items: list[dict[str, Any]], parent: dict[str, Any] | None) -> None:
        for item in items or []:
            aid = int(item["CustomerAgendaItemID"])
            item_title = html.unescape(str(item.get("Title") or "")).strip()
            desc = _TAG_RE.sub(" ", html.unescape(str(item.get("Description") or "")))
            span = spans.get(aid)
            inherited = False
            if span is None and parent is not None and parent.get("start") is not None:
                # Consent-agenda sub-items (minutes, financial reports) have no
                # timestamp of their own; they're taken up with their parent.
                span = (parent["start"], parent["end"])
                inherited = True
            seg = {
                "agenda_item_id": aid,
                "title": item_title,
                "parent_id": parent["agenda_item_id"] if parent else None,
                "parent_title": parent["title"] if parent else "",
                "refs": sorted("|".join(r) for r in refs(f"{item_title} {desc}")),
                "start": span[0] if span else None,
                "end": span[1] if span else None,
                "inherited": inherited,
                # Where the start came from: "champ" (the Village's own
                # timeline), "transcript" or "gap" (fill_untimed), or None.
                "timing": "champ" if span else None,
            }
            segments.append(seg)
            walk(item.get("Children") or [], seg)

    walk((raw.get("Agenda") or {}).get("AgendaItems") or [], None)
    return {
        "event_id": event_id,
        "date": str(event.get("EventDateTimeCustomerLocal") or "")[:10],
        "board": board_key(title),
        "title": title,
        "url": PLAYER_URL.format(event_id=event_id),
        "last_modified": event.get("LastModifyDateTimeUTC") or "",
        "has_timeline": bool(spans),
        "segments": segments,
    }


# ── Filling in items the Village didn't timestamp ──────────────────────────
#
# Some agenda items have no timeline entry (consent minutes under an untimed
# "Consent Agenda" heading, a public-hearing block), and a few meetings have
# no timeline at all. Most videos have a WebVTT caption transcript, and the
# chair reads each item's title aloud as it comes up, so the item's place is
# found by searching the transcript for its title words: in agenda order, and
# for untimed items in a timed meeting only between the neighbouring items'
# timestamps. Checked against 246 items the Village did timestamp: median
# error 4 s, 90% within 18 s. Without a transcript, an untimed item between
# two timed ones is placed where the earlier one ends (most such gaps are a
# few seconds: the item went by without discussion).

CAPTION_URL = "https://play.champds.com/CAPTION/esterofl{path}"
_CUE_TIME_RE = re.compile(r"^(\d+):(\d\d):(\d\d)[.,]\d+\s+-->")
# Words too common in a meeting to locate one item by.
_TRANSCRIPT_GENERIC = set(
    "meeting board public hearing district application pending development order amendment "
    "review update agenda minutes report".split()
)
TRANSCRIPT_WINDOW_S = 30
TRANSCRIPT_STEP_S = 5
TRANSCRIPT_MATCH_MIN = 0.75
# How far ahead of the last placed item to look in an untimed meeting.
TRANSCRIPT_LOOKAHEAD_S = 5400
# Longest gap between placed neighbours in which a one-word heading may be
# searched for (wider gaps added misses in the holdout check).
SHORT_TITLE_SPAN_S = 600


def parse_vtt(text: str) -> list[tuple[int, str]]:
    """WebVTT → [(start second, caption line)]."""
    cues: list[tuple[int, str]] = []
    start: int | None = None
    for line in (text or "").splitlines():
        m = _CUE_TIME_RE.match(line.strip())
        if m:
            start = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
            continue
        line = line.strip()
        if start is not None and line and not line.isdigit() and line != "WEBVTT":
            cues.append((start, line))
    return cues


def _locator_tokens(title: str) -> set[str]:
    return {t for t in _tokens(_lead(title)) if t not in _TRANSCRIPT_GENERIC}


def _cue_words(line: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", line.lower()))


def locate_in_transcript(
    cues: list[tuple[int, str]], title: str, lo: int, hi: int | None, min_tokens: int = 2
) -> int | None:
    """Second at which *title* is read out in [lo, hi), or None. Titles with
    fewer than *min_tokens* distinctive words ("Consent Agenda") are only
    searched for when the caller has bounded the range tightly."""
    want = _locator_tokens(title)
    if len(want) < min_tokens or not cues:
        return None
    times = [t for t, _ in cues]
    words = [_cue_words(line) for _, line in cues]
    end = times[-1] + 1
    hi = min(hi if hi is not None else end, end)
    best_score, best_at = 0.0, None
    for w0 in range(max(lo, 0), hi, TRANSCRIPT_STEP_S):
        a = bisect.bisect_left(times, w0)
        b = bisect.bisect_left(times, w0 + TRANSCRIPT_WINDOW_S)
        seen = set().union(*words[a:b]) if b > a else set()
        score = len(want & seen) / len(want)
        if score > best_score + 1e-9:
            best_score, best_at = score, w0
    if best_at is None or best_score < TRANSCRIPT_MATCH_MIN:
        return None
    # The window's first caption line that names the item.
    a = bisect.bisect_left(times, best_at)
    b = bisect.bisect_left(times, best_at + TRANSCRIPT_WINDOW_S)
    return next((times[k] for k in range(a, b) if want & words[k]), best_at)


def fill_untimed(meeting: dict[str, Any], cues: list[tuple[int, str]] | None) -> int:
    """Give untimed agenda items an approximate start, in place. Returns how
    many items were filled. Village timestamps are never changed."""
    segs = meeting.get("segments") or []
    for seg in segs:
        if seg.get("inherited") or seg.get("timing") != "champ":
            # Re-derived below, from the parent once it may have been filled.
            seg.update(start=None, end=None, inherited=False, timing=None)
    own = [i for i, s in enumerate(segs) if s["timing"] == "champ"]
    by_id = {seg["agenda_item_id"]: seg for seg in segs}
    filled = 0
    cursor = 0
    for i, seg in enumerate(segs):
        if seg["timing"] == "champ":
            cursor = seg["start"]
            continue
        nxt = next((segs[j] for j in own if j > i), None)
        prev = next((segs[j] for j in reversed(own) if j < i), None)
        parent = by_id.get(seg.get("parent_id"))
        if parent is not None and parent.get("start") is not None:
            # A sub-item is taken up inside its parent's block: look for it
            # there, else it inherits the parent's start (below). Never place
            # it after the block, where the neighbour gap would.
            lo = parent["start"]
            hi = parent.get("end") if (parent.get("end") or 0) > lo else (nxt["start"] if nxt else None)
            at = locate_in_transcript(cues, seg["title"], lo, hi) if cues else None
            if at is not None:
                seg.update(start=at, end=None, timing="transcript")
                filled += 1
            else:
                # Inherit now, not after the loop, so this item's own
                # sub-items (Business → Consent Agenda → minutes) see it.
                seg.update(start=parent["start"], end=parent.get("end"), inherited=True,
                           timing=parent["timing"])
            continue
        hi = nxt["start"] if nxt else None
        if not meeting.get("has_timeline"):
            hi = cursor + TRANSCRIPT_LOOKAHEAD_S
        at = locate_in_transcript(cues, seg["title"], cursor, hi) if cues else None
        if at is not None:
            seg.update(start=at, end=None, timing="transcript")
            cursor = at
            filled += 1
        elif prev and nxt and meeting.get("has_timeline"):
            prev_end = prev["end"] if (prev.get("end") or 0) >= prev["start"] else prev["start"]
            at = min(prev_end, nxt["start"])
            if at >= prev["start"]:
                seg.update(start=at, end=None, timing="gap")
                filled += 1
    # Second pass: a short title ("CONSENT AGENDA") is too common to search
    # a whole meeting for, but safe between two items already placed.
    # Only headings with sub-items are worth it: placing them gives their
    # sub-items (consent minutes, financial reports) a time.
    has_children = {seg.get("parent_id") for seg in segs}
    if cues:
        for i, seg in enumerate(segs):
            if seg.get("start") is not None or seg["agenda_item_id"] not in has_children:
                continue
            if by_id.get(seg.get("parent_id"), {}).get("start") is not None:
                continue
            before = next((s for s in reversed(segs[:i]) if s.get("start") is not None), None)
            after = next((s for s in segs[i + 1:] if s.get("start") is not None), None)
            if before is None or after is None or not 0 < after["start"] - before["start"] <= SHORT_TITLE_SPAN_S:
                continue
            at = locate_in_transcript(cues, seg["title"], before["start"], after["start"], min_tokens=1)
            if at is not None:
                seg.update(start=at, end=None, timing="transcript")
                filled += 1
    # Sub-items still untimed are taken up with their parent (agenda order
    # puts parents first, so a grandchild sees its parent already resolved).
    for seg in segs:
        if seg.get("start") is None and seg.get("parent_id") is not None:
            parent = by_id.get(seg["parent_id"])
            if parent and parent.get("start") is not None:
                seg.update(start=parent["start"], end=parent.get("end"), inherited=True, timing=parent["timing"])
    return filled


def _nearby_dates(day: str, days: int = NEARBY_DAYS) -> list[str]:
    """Dates within *days* of *day*, closest first, excluding *day* itself."""
    try:
        base = datetime.date.fromisoformat(day)
    except ValueError:
        return []
    out = []
    for n in range(1, days + 1):
        for sign in (-1, 1):
            out.append((base + datetime.timedelta(days=sign * n)).isoformat())
    return out


def timestamp_url(event_id: int, start: int) -> str:
    """The player's own share-link format: opens the video at *start*."""
    return f"{PLAYER_URL.format(event_id=event_id)}/s/{int(start)}"


def format_clock(seconds: int) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


@dataclass
class VideoClip:
    """A link that opens the meeting video at an agenda item."""

    url: str
    event_id: int
    start: int
    end: int | None = None
    segment_title: str = ""
    # How the item was matched: "ref" (resolution/ordinance no.) or "title".
    match: str = ""
    # Where the start came from: "champ" (the Village's timeline, exact) or
    # "transcript"/"gap" (estimated by fill_untimed).
    timing: str = "champ"
    # "discussion", or "agenda" for an item removed from the agenda, which
    # links the agenda-approval vote that removed it.
    purpose: str = "discussion"

    @property
    def approximate(self) -> bool:
        return self.timing in ("transcript", "gap")

    @property
    def label(self) -> str:
        clock = format_clock(self.start)
        when = f"about {clock}" if self.approximate else clock
        if self.purpose == "agenda":
            return f"Watch agenda approval ({when})"
        return f"Watch discussion ({when})"

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "label": self.label, "approximate": self.approximate}


def match_segment(
    meeting: dict[str, Any], title: str, application_id: str = ""
) -> tuple[dict[str, Any], str] | None:
    """Best timestamped agenda item in *meeting* for a record, or None."""
    rec_refs = refs(f"{title} {application_id}")
    best: tuple[tuple[float, float, int], dict[str, Any], str] | None = None
    for seg in meeting.get("segments") or []:
        if seg.get("start") is None:
            continue
        seg_refs = {tuple(r.split("|")) for r in seg.get("refs") or []}
        overlap = title_overlap(title, seg["title"])
        # Whole-title overlap breaks ties between items that share a name
        # (two lien-mitigation requests differing only by case number).
        detail = _overlap(_tokens(title), _tokens(seg["title"]))
        if rec_refs and seg_refs and _refs_agree(rec_refs, seg_refs):
            # A shared number is strong evidence, but the title still ranks
            # items that cite the same number (a project and its sub-items,
            # or two change orders on one contract).
            how, score = "ref", 0.5 + overlap
        elif overlap >= TITLE_MATCH_MIN:
            how, score = "title", overlap
        else:
            continue
        # Prefer a segment with its own timestamp over an inherited one.
        rank = (score, detail, 0 if seg.get("inherited") else 1)
        if best is None or rank > best[0]:
            best = (rank, seg, how)
    return (best[1], best[2]) if best else None


class MeetingVideoIndex:
    """meetings.json keyed by (date, board), reloaded when the file changes."""

    def __init__(self, path: str = MEETING_VIDEOS_FILE):
        self.path = path
        self._mtime: float | None = None
        self._by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            self._by_key, self._mtime = {}, None
            return
        if mtime == self._mtime:
            return
        with self._lock:
            if mtime == self._mtime:
                return
            try:
                with open(self.path, encoding="utf-8") as f:
                    meetings = json.load(f).get("meetings", [])
            except (OSError, ValueError) as exc:
                print(f"Meeting videos unavailable ({exc})")
                meetings = []
            by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
            for m in meetings:
                if m.get("date") and m.get("board"):
                    by_key.setdefault((m["date"], m["board"]), []).append(m)
            self._by_key, self._mtime = by_key, mtime

    def meetings(self) -> list[dict[str, Any]]:
        self._ensure_loaded()
        return [m for ms in self._by_key.values() for m in ms]

    def meetings_for(self, date: str, board: str) -> list[dict[str, Any]]:
        key = board_key(board)
        if not key or not date:
            return []
        self._ensure_loaded()
        return self._by_key.get((str(date)[:10], key), [])

    def clip_for(self, date: str, board: str, title: str, application_id: str = "") -> VideoClip | None:
        date = str(date or "")[:10]
        if date < VIDEO_SINCE:
            return None
        meetings = self.meetings_for(date, board)
        # A few gold rows carry a date a day or two off the meeting's (e.g. a
        # minutes PDF dated when it was signed), so nearby meetings are tried
        # when the exact date has no match.
        nearby = [m for d in _nearby_dates(date) for m in self.meetings_for(d, board)]
        if not meetings and not nearby:
            return None
        title, removed = removed_from_agenda(title)
        if removed:
            return self._agenda_approval_clip(meetings)
        found: tuple[dict[str, Any], dict[str, Any], str] | None = None
        # Exact-date meetings first; nearby ones only if those had no match.
        for group in (meetings, nearby):
            for m in group:
                hit = match_segment(m, title, application_id)
                if hit and (found is None or (hit[1] == "ref" and found[2] != "ref")):
                    found = (m, hit[0], hit[1])
            if found:
                break
        if found:
            m, seg, how = found
            return VideoClip(
                url=timestamp_url(m["event_id"], seg["start"]),
                event_id=m["event_id"],
                start=seg["start"],
                end=seg["end"],
                segment_title=seg["title"],
                match=how,
                timing=seg.get("timing") or "champ",
            )
        # No confident match: no link. A whole-meeting video is hours long
        # and doesn't help find the item, so it's never offered.
        return None

    def _agenda_approval_clip(self, meetings: list[dict[str, Any]]) -> VideoClip | None:
        """Where a removed item went: the agenda-approval vote."""
        for m in meetings:
            seg = next(
                (s for s in m.get("segments") or []
                 if s.get("start") is not None and _AGENDA_APPROVAL_RE.search(s["title"])),
                None,
            )
            if seg:
                return VideoClip(
                    url=timestamp_url(m["event_id"], seg["start"]),
                    event_id=m["event_id"],
                    start=seg["start"],
                    end=seg.get("end"),
                    segment_title=seg["title"],
                    match="removed",
                    timing=seg.get("timing") or "champ",
                    purpose="agenda",
                )
        return None


_index = MeetingVideoIndex()


def get_index() -> MeetingVideoIndex:
    return _index


def clip_for_row(row: dict[str, Any]) -> VideoClip | None:
    """Clip for a gold-corpus row (structured/RAG cards). Never raises."""
    from schema_aliases import row_value

    try:
        title = row_value(row, "ProjectTitle", "project_name")
        return _index.clip_for(
            row_value(row, "meeting_date"),
            row_value(row, "board"),
            title,
            row_value(row, "application_id"),
        )
    except Exception as exc:  # a video link must never break an answer
        print(f"Meeting video lookup failed ({exc})")
        return None
