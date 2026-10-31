"""Narrow retrieval hits to the specific thing a question names.

Two resident-feedback cases this covers:

* Anchor terms: "Aldi on Corkscrew Rd" retrieved everything on Corkscrew Road,
  because the road words outweigh the one rare word (Aldi) that is the actual
  subject. When a rare query term appears in the top hit, hits that don't
  mention any such term are dropped — the road becomes a locator, not the topic.
* Road direction: "Williams Rd West" returned all of Williams Road. In Estero,
  East/West on an east-west road means the side of US 41 (Broadway East/West,
  "Williams Road West of US41"), except Corkscrew, where "East Corkscrew" means
  east of I-75. Hits clearly on the other side — by their text, or by their
  geocode — are dropped; hits whose side is unknown are kept.

Both filters only ever remove hits, and fall back to the input when they would
remove everything.
"""
from __future__ import annotations

import re
from bisect import bisect_left
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from langchain_core.documents import Document

from config import ENABLE_QUERY_FOCUS
from schema_aliases import row_value
from store import DataStore, _tokenize

# ---------------------------------------------------------------------------
# Anchor terms
# ---------------------------------------------------------------------------

# A query term in at most this share of chunks is "rare" (~50 of ~10.8k
# chunks): business and project names (aldi, wawa, pickleball) qualify, road
# and civic vocabulary (corkscrew, williams, council, zoning) don't.
ANCHOR_MAX_DF_RATIO = 0.005

# Words that can be rare in the corpus without naming a subject. The top-hit
# check in anchor_terms already rejects most of these; listing the common ones
# keeps it from depending on that alone.
_NON_ANCHOR_TERMS = frozenset(
    {
        # question / request words
        "what", "which", "where", "when", "who", "why", "how", "tell", "about", "show",
        "give", "know", "find", "info", "information", "update", "updates", "news",
        "latest", "recent", "recently", "newest", "current", "currently", "status",
        "happening", "happened", "going", "plan", "plans", "planned", "planning",
        "decide", "decided", "decision", "decisions", "approve", "approved", "approval",
        "build", "building", "built", "open", "opening", "opened", "close", "closing",
        "closed", "expected", "will", "can", "could", "would", "should", "please",
        "anything", "something", "everything", "there", "here", "near", "nearby",
        "around", "along", "between", "next", "last", "year", "years", "month", "months",
        "week", "weeks", "day", "days", "today", "now", "soon", "still", "yet", "ever",
        # road / place vocabulary: a locator, never the subject
        "road", "rd", "street", "blvd", "boulevard", "parkway", "pkwy", "avenue", "ave",
        "lane", "drive", "trail", "trl", "highway", "hwy", "east", "west", "north",
        "south", "side", "corner", "intersection", "estero", "village", "florida",
        "address", "located", "location",
    }
)


def _token_doc_freq(store: DataStore) -> dict[str, int]:
    """Chunks containing each BM25 token, cached on the store (rebuilt with it)."""
    cached = getattr(store, "_token_df", None)
    if cached is not None:
        return cached
    df: dict[str, int] = {}
    for freqs in getattr(store.bm25, "doc_freqs", None) or []:
        for tok in freqs:
            df[tok] = df.get(tok, 0) + 1
    store._token_df = df
    return df


def _doc_tokens(doc: Document) -> set[str]:
    return set(_tokenize(doc.page_content or ""))


def anchor_terms(store: DataStore, question: str, hits: list[tuple[Document, float]]) -> set[str]:
    """Rare subject terms of *question* that the top-ranked hit confirms.

    Needs at least one other content word alongside: a question that is only
    the rare term ("aldi") is already as focused as it gets. The top-hit check
    drops terms that are rare but incidental — if the reranker's best match
    doesn't contain the term, it isn't what the question hinges on.
    """
    if store.bm25 is None or not hits:
        return set()
    content = [t for t in dict.fromkeys(_tokenize(question)) if t not in _NON_ANCHOR_TERMS]
    if len(content) < 2:
        return set()
    df = _token_doc_freq(store)
    limit = max(1, int(len(store.bm25_ids) * ANCHOR_MAX_DF_RATIO))
    rare = {t for t in content if 0 < df.get(t, 0) <= limit and not t.isdigit()}
    if not rare or len(rare) == len(content):
        return set()
    return rare & _doc_tokens(hits[0][0])


def filter_to_anchor(
    store: DataStore, hits: list[tuple[Document, float]], question: str
) -> list[tuple[Document, float]]:
    """Keep only hits that mention one of the question's anchor terms."""
    anchors = anchor_terms(store, question, hits)
    if not anchors:
        return hits
    kept = [(d, s) for d, s in hits if anchors & _doc_tokens(d)]
    return kept or hits


# ---------------------------------------------------------------------------
# Road direction (east / west of US 41)
# ---------------------------------------------------------------------------

_ROAD_SUFFIX = r"(?:road|rd|boulevard|blvd|parkway|pkwy|avenue|ave|drive|dr|lane|ln)\.?"
_DIR = r"(?P<dir>east|west)(?:ern)?"
_ROAD_WORD = r"(?P<road>[a-z][a-z'-]+)"
# "west williams rd", "east side of corkscrew road", "western williams road"
_QUERY_DIR_FIRST_RE = re.compile(
    rf"\b{_DIR}\s+(?:side\s+of\s+|end\s+of\s+|part\s+of\s+)?(?:the\s+)?{_ROAD_WORD}\s+{_ROAD_SUFFIX}(?!\w)",
    re.IGNORECASE,
)
# "williams rd west", "williams road, west of US 41"
_QUERY_ROAD_FIRST_RE = re.compile(
    rf"\b{_ROAD_WORD}\s+{_ROAD_SUFFIX}\s*,?\s*(?:on\s+the\s+)?{_DIR}\b(?!\s*/)",
    re.IGNORECASE,
)
_I75_RE = re.compile(r"\b(?:i-?\s?75|interstate(?:\s+75)?)\b", re.IGNORECASE)
_US41_RE = re.compile(r"\b(?:us|u\.s\.)\s*-?\s*41\b|\btamiami\b|\b41\b", re.IGNORECASE)
_NOT_ROAD_NAMES = frozenset({"the", "a", "this", "that", "my", "our", "main", "new", "old"})


@dataclass(frozen=True)
class RoadSide:
    road: str  # lowercase road name word, e.g. "williams"
    side: str  # "east" | "west"
    divider: str  # "US 41" | "I-75"


# Centerline longitude by latitude through the Estero area (approximate;
# interpolated linearly, clamped at the ends). Taken from geocoded parcels on
# S Tamiami Trail and the interchanges; the margin below absorbs the error.
_US41_LINE = [
    (26.380, -81.8140), (26.402, -81.8128), (26.425, -81.8114), (26.438, -81.8102),
    (26.442, -81.8125), (26.451, -81.8180), (26.470, -81.8260),
]
_I75_LINE = [(26.380, -81.7700), (26.440, -81.7740), (26.480, -81.7760)]
_DIVIDERS = {"US 41": _US41_LINE, "I-75": _I75_LINE}
# Within this many degrees of longitude (~200 m) the side is too close to call.
_SIDE_MARGIN = 0.002
# Roads whose East/West naming refers to I-75 instead of US 41 ("East Corkscrew").
_I75_ROADS = frozenset({"corkscrew"})
# Geocodes coarser than a point (a whole street, a neighborhood) say nothing
# about which side of the divider an item is on.
_COARSE_GRAINS = frozenset({"whole_street", "neighborhood", "road_segment"})
_MIN_GEOCODE_CONFIDENCE = 0.8


def query_road_side(question: str) -> RoadSide | None:
    """The road and side a question restricts to, e.g. "Williams Rd west"."""
    q = question or ""
    for rx in (_QUERY_DIR_FIRST_RE, _QUERY_ROAD_FIRST_RE):
        m = rx.search(q)
        if m and m.group("road").lower() not in _NOT_ROAD_NAMES:
            road = m.group("road").lower()
            if _I75_RE.search(q):
                divider = "I-75"
            elif _US41_RE.search(q):
                divider = "US 41"
            else:
                divider = "I-75" if road in _I75_ROADS else "US 41"
            return RoadSide(road=road, side=m.group("dir").lower(), divider=divider)
    return None


def _divider_lon(divider: str, lat: float) -> float:
    line = _DIVIDERS[divider]
    lats = [p[0] for p in line]
    i = bisect_left(lats, lat)
    if i <= 0:
        return line[0][1]
    if i >= len(line):
        return line[-1][1]
    (lat0, lon0), (lat1, lon1) = line[i - 1], line[i]
    return lon0 + (lon1 - lon0) * (lat - lat0) / (lat1 - lat0)


def _text_side(text: str, target: RoadSide) -> str | None:
    """Side of *target.road* that *text* explicitly names, if exactly one."""
    road = re.escape(target.road)
    divider = r"(?:I-?\s?75|interstate)" if target.divider == "I-75" else r"(?:US|U\.S\.)\s*-?\s*41"
    sides = set()
    for side in ("east", "west"):
        patterns = (
            rf"\b{side}\s+{road}\b",
            rf"\b{road}\s+{_ROAD_SUFFIX}\s*,?\s*{side}\b(?!\s*/)",
            rf"\b{road}\b[^.]{{0,80}}?\b{side}\s+of\s+{divider}",
        )
        if any(re.search(p, text, re.IGNORECASE) for p in patterns):
            sides.add(side)
    return sides.pop() if len(sides) == 1 else None


def _geo_side(row: dict[str, Any], divider: str) -> str | None:
    if row_value(row, "LocationGrain") in _COARSE_GRAINS:
        return None
    try:
        lat = float(row_value(row, "latitude"))
        lon = float(row_value(row, "longitude"))
        confidence = float(row_value(row, "GeocodeConfidence") or 0)
    except ValueError:
        return None
    if confidence < _MIN_GEOCODE_CONFIDENCE:
        return None
    delta = lon - _divider_lon(divider, lat)
    if abs(delta) < _SIDE_MARGIN:
        return None
    return "east" if delta > 0 else "west"


def hit_side(store: DataStore, doc: Document, target: RoadSide) -> str | None:
    """Which side of the divider *doc* is on: its text first, then its geocode."""
    side = _text_side(doc.page_content or "", target)
    if side or doc.metadata.get("source_type"):
        return side
    row_index = doc.metadata.get("row_index")
    if row_index is None or store.dataframe is None or store.dataframe.empty:
        return None
    try:
        row = store.dataframe.iloc[int(row_index)].to_dict()
    except (IndexError, ValueError, TypeError):
        return None
    return _geo_side(row, target.divider)


def filter_to_road_side(
    store: DataStore, hits: list[tuple[Document, float]], question: str
) -> list[tuple[Document, float]]:
    """Drop hits clearly on the other side of the road the question names."""
    target = query_road_side(question)
    if target is None:
        return hits
    kept = [(d, s) for d, s in hits if hit_side(store, d, target) in (None, target.side)]
    return kept or hits


def focus_hits(
    store: DataStore, hits: list[tuple[Document, float]], question: str
) -> list[tuple[Document, float]]:
    """Apply both narrowing filters (input order is preserved)."""
    if not ENABLE_QUERY_FOCUS:
        return hits
    return filter_to_road_side(store, filter_to_anchor(store, hits, question), question)


# ---------------------------------------------------------------------------
# Anchor-focused excerpts
# ---------------------------------------------------------------------------

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
# Sentences kept after each matching one: roundup articles give a project a
# heading-like sentence, then its permits, dates and access.
_FOLLOWING_SENTENCES = 2


def focus_excerpt(text: str, about: Callable[[str], bool] | None) -> str:
    """The sentences of *text* that *about* matches (each plus the next two).

    A roundup article ("East Corkscrew Updates", "Road Development Updates")
    covers a dozen projects; sent whole, the answer model summarizes all of
    them. Returns *text* unchanged when no sentence matches.
    """
    if about is None or not text:
        return text
    sentences = _SENTENCE_SPLIT_RE.split(text)
    keep: set[int] = set()
    for i, sentence in enumerate(sentences):
        if about(sentence):
            keep.update(range(i, min(i + 1 + _FOLLOWING_SENTENCES, len(sentences))))
    if not keep:
        return text
    parts: list[str] = []
    prev = None
    for i in sorted(keep):
        if prev is not None and i != prev + 1:
            parts.append("…")
        parts.append(sentences[i])
        prev = i
    return " ".join(parts)


def excerpt_focus(
    store: DataStore, question: str, hits: list[tuple[Document, float]]
) -> tuple[Callable[[str], bool] | None, set[str], RoadSide | None]:
    """What article excerpts should be trimmed to for *question*: sentences
    naming its anchor terms, or else sentences naming the asked road side.
    Also returns the anchors and side, for logging."""
    if not ENABLE_QUERY_FOCUS:
        return None, set(), None
    anchors = anchor_terms(store, question, hits)
    side = query_road_side(question)
    if anchors:
        return (lambda sentence: bool(anchors & set(_tokenize(sentence)))), anchors, side
    if side:
        return (lambda sentence: _text_side(sentence, side) == side.side), anchors, side
    return None, anchors, side
