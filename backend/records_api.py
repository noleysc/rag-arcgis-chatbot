"""Board Records API: the agenda items the chatbot answers from, for the
frontend's Board Records page.

Reads the same dataframe the chatbot uses (the pipeline's gold
meetings_ai_public.csv, loaded by store.py), so the page updates whenever
the pipeline refreshes the data and the VPS redeploys. It replaced reading
the ArcGIS Online feature layer, which is a one-time copy that only holds
mappable items and has to be re-uploaded by hand.

    GET /api/records          one page of agenda items + total matching, each
                              with its timestamped meeting-video link or null
    GET /api/records/boards   distinct board names, for the filter
    GET /api/records/minutes  distinct minutes PDFs, newest first
    GET /api/records/summary  record count and newest/oldest meeting date
"""
from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from meeting_videos import clip_for_row
from store import get_store

router = APIRouter()

# Agenda item types that record a formal board action — must match
# DECISION_ITEM_TYPES in frontend-react/src/lib/boardRecords.ts.
DECISION_ITEM_TYPES = frozenset(
    {"Vote", "Ordinance", "Resolution", "Contract Approval", "Budget", "Consent Agenda"}
)
MAX_PAGE_SIZE = 100

# Normalized view of the store's dataframe, rebuilt only when that dataframe
# object changes (startup, or an admin /load).
_cache: dict[str, Any] = {"source_id": None, "frame": None}


def _text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip().replace({"nan": "", "None": ""})


def _column(df: pd.DataFrame, *names: str) -> pd.Series:
    """First existing column among `names` (gold vs. legacy CSV spellings)."""
    for name in names:
        if name in df.columns:
            return _text(df[name])
    return pd.Series([""] * len(df), index=df.index)


def _records_frame() -> pd.DataFrame:
    store = get_store()
    df = getattr(store, "dataframe", None) if store is not None else None
    if df is None or df.empty:
        raise HTTPException(503, "No board data loaded yet.")
    if _cache["source_id"] == id(df) and _cache["frame"] is not None:
        return _cache["frame"]

    name = _column(df, "ProjectName")
    title = name.where(name != "", _column(df, "ProjectTitle"))
    frame = pd.DataFrame(
        {
            # Row position: stable for this dataset, and the tie-break that
            # keeps a meeting's items in agenda order.
            "id": range(len(df)),
            "title": title,
            "date": _column(df, "MeetingDate").str.slice(0, 10),
            "board": _column(df, "Board", "SourceBoard"),
            "item_type": _column(df, "AgendaItemType").replace({"Unknown": ""}),
            "action": _column(df, "ActionTaken", "Outcome"),
            "application_id": _column(df, "ApplicationID", "ApplicationId"),
            "minutes_url": _column(df, "Document_Link", "PrimarySourceUrl"),
        }
    )
    frame["_search"] = (
        frame["title"] + "\n" + name + "\n" + frame["action"] + "\n" + frame["application_id"]
    ).str.upper()
    frame["_title_key"] = frame["title"].str.lower()
    _cache.update(source_id=id(df), frame=frame)
    return frame


def _filtered(
    frame: pd.DataFrame,
    *,
    decisions_only: bool = False,
    board: str = "",
    q: str = "",
) -> pd.DataFrame:
    mask = pd.Series(True, index=frame.index)
    if decisions_only:
        mask &= frame["item_type"].isin(DECISION_ITEM_TYPES)
    if board.strip():
        mask &= frame["board"] == board.strip()
    for term in q.upper().split():
        mask &= frame["_search"].str.contains(term, regex=False)
    return frame[mask]


@router.get("/api/records")
def list_records(
    view: Literal["all", "decisions"] = "all",
    board: str = "",
    q: str = Query("", max_length=200),
    sort: Literal["newest", "oldest", "title"] = "newest",
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
) -> dict[str, Any]:
    rows = _filtered(_records_frame(), decisions_only=view == "decisions", board=board, q=q)
    if sort == "title":
        rows = rows.sort_values(["_title_key", "date"], ascending=[True, False], kind="stable")
    else:
        asc = sort == "oldest"
        rows = rows.sort_values(["date", "id"], ascending=[asc, asc], kind="stable")
    page = rows.iloc[offset : offset + limit]
    public = ["id", "title", "date", "board", "item_type", "action", "application_id", "minutes_url"]
    records = page[public].to_dict(orient="records")
    source = get_store().dataframe
    for rec in records:
        rec["video"] = _video(source, rec["id"])
    return {"records": records, "total": int(len(rows))}


def _video(source: pd.DataFrame, row_id: int) -> dict[str, Any] | None:
    """The agenda item's timestamped meeting-video link (meeting_videos.py,
    the same matcher the chat cards use), or None. Only links that open at
    the item are offered, never a whole-meeting video."""
    try:
        clip = clip_for_row(source.iloc[int(row_id)].to_dict())
    except (IndexError, ValueError):
        return None
    if clip is None:
        return None
    return {"url": clip.url, "label": clip.label, "start": clip.start, "approximate": clip.approximate}


@router.get("/api/records/boards")
def list_boards() -> dict[str, list[str]]:
    boards = _records_frame()["board"]
    return {"boards": sorted(b for b in boards.unique() if b)}


@router.get("/api/records/minutes")
def list_minutes(board: str = "", q: str = Query("", max_length=200)) -> dict[str, Any]:
    """Each minutes PDF once, newest meeting first. With `q`, only meetings
    that have an agenda item matching the search."""
    rows = _filtered(_records_frame(), board=board, q=q)
    rows = rows[rows["minutes_url"] != ""].sort_values(["date", "id"], ascending=[False, False], kind="stable")
    docs = rows.drop_duplicates("minutes_url")[["date", "board", "minutes_url"]]
    return {"docs": docs.rename(columns={"minutes_url": "url"}).to_dict(orient="records")}


@router.get("/api/records/summary")
def records_summary() -> dict[str, Any]:
    dates = _records_frame()["date"]
    dates = dates[dates != ""]
    return {
        "total": int(len(_records_frame())),
        "latest_meeting": dates.max() if len(dates) else None,
        "first_meeting": dates.min() if len(dates) else None,
    }
