"""Aggregate gold board records into browsable development projects.

Projects are grouped by ``ProjectId`` from ``meetings_ai_public.csv``. Silver
``projects.csv`` is name/status only; the gold rows carry dates, status, coords,
and minutes links needed for a tracker UI.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache
from typing import Any

import pandas as pd

from config import DEFAULT_CSV_PATH
from schema_aliases import load_dataframe, row_value
from store import get_store

CATEGORY_LABELS: dict[str, str] = {
    "commercial_mixed_use_development": "Commercial & mixed-use",
    "residential_development": "Residential",
    "transportation_mobility": "Transportation",
    "utilities_stormwater_environment": "Utilities & environment",
    "budget_contracts_purchasing": "Budget & contracts",
    "public_facilities_services": "Public facilities",
    "meetings_records_public_input": "Meetings & public input",
    "industry_mining_agriculture": "Industry & agriculture",
}

# Prefer decision-like statuses when rolling up a project's latest outcome.
_STATUS_RANK = {
    "denied": 5,
    "failed": 5,
    "withdrawn": 4,
    "approved": 3,
    "continued": 2,
    "tabled": 2,
    "no action": 1,
    "unknown": 0,
}


def category_label(raw: str | None) -> str:
    key = (raw or "").strip()
    if not key:
        return ""
    return CATEGORY_LABELS.get(key, key.replace("_", " ").title())


def _nullable_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _dataframe() -> pd.DataFrame:
    store = get_store()
    if store is not None and store.dataframe is not None and not store.dataframe.empty:
        return store.dataframe
    return load_dataframe(DEFAULT_CSV_PATH)


def _rows_with_projects(df: pd.DataFrame) -> list[dict[str, Any]]:
    if "ProjectId" not in df.columns:
        return []
    mask = df["ProjectId"].notna() & (df["ProjectId"].astype(str).str.strip() != "")
    return df.loc[mask].to_dict(orient="records")


def _status_rank(status: str) -> int:
    key = (status or "").strip().lower()
    for needle, rank in _STATUS_RANK.items():
        if needle in key:
            return rank
    return 0


def _pick_coords(items: list[dict[str, Any]]) -> tuple[float | None, float | None]:
    for row in items:
        lat = _nullable_float(row.get("Latitude") or row.get("Lat"))
        lng = _nullable_float(row.get("Longitude") or row.get("Lon") or row.get("Lng"))
        if lat is not None and lng is not None:
            return lat, lng
    return None, None


def _build_project(project_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(
        items,
        key=lambda r: row_value(r, "meeting_date") or "",
        reverse=True,
    )
    latest = ordered[0]
    # Prefer the highest-signal status among recent items, falling back to latest.
    status = ""
    best_rank = -1
    for row in ordered[:6]:
        candidate = row_value(row, "status", "outcome", "action_taken")
        rank = _status_rank(candidate)
        if rank > best_rank and candidate:
            status = candidate
            best_rank = rank
    if not status:
        status = row_value(latest, "status", "outcome", "action_taken") or "Unknown"

    categories = [
        row.get("LandUseCategory")
        for row in ordered
        if str(row.get("LandUseCategory") or "").strip()
    ]
    category_raw = str(categories[0]).strip() if categories else ""
    lat, lng = _pick_coords(ordered)
    name = (
        row_value(latest, "project_name")
        or row_value(ordered[-1], "project_name")
        or f"Project {project_id}"
    )
    application_id = ""
    for row in ordered:
        application_id = row_value(row, "application_id")
        if application_id:
            break

    return {
        "project_id": str(project_id).strip(),
        "name": name,
        "status": status,
        "category": category_label(category_raw),
        "category_key": category_raw,
        "last_date": row_value(latest, "meeting_date") or None,
        "first_date": row_value(ordered[-1], "meeting_date") or None,
        "board": row_value(latest, "board") or None,
        "application_id": application_id or None,
        "location": row_value(latest, "location") or None,
        "summary": row_value(latest, "summary") or None,
        "document_url": row_value(latest, "document_url") or None,
        "lat": lat,
        "lng": lng,
        "item_count": len(items),
    }


@lru_cache(maxsize=4)
def _cached_projects(csv_mtime: float, csv_path: str) -> tuple[dict[str, Any], ...]:
    df = load_dataframe(csv_path)
    return tuple(_aggregate(df).values())


def _aggregate(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in _rows_with_projects(df):
        pid = str(row.get("ProjectId") or "").strip()
        if not pid:
            continue
        grouped.setdefault(pid, []).append(row)
    return {pid: _build_project(pid, items) for pid, items in grouped.items()}


def list_projects_index() -> list[dict[str, Any]]:
    """Return all aggregated projects (unsorted)."""
    store = get_store()
    if store is not None and store.dataframe is not None and not store.dataframe.empty:
        return list(_aggregate(store.dataframe).values())
    import os

    path = DEFAULT_CSV_PATH
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0.0
    return list(_cached_projects(mtime, path))


def _matches_query(project: dict[str, Any], q: str) -> bool:
    if not q:
        return True
    blob = " ".join(
        str(project.get(k) or "")
        for k in ("name", "application_id", "location", "summary", "status", "category", "board")
    ).lower()
    return all(token in blob for token in q.lower().split())


def list_projects(
    *,
    q: str = "",
    status: str = "",
    category: str = "",
    sort: str = "recent",
    offset: int = 0,
    limit: int = 25,
) -> dict[str, Any]:
    projects = list_projects_index()
    status_l = status.strip().lower()
    category_l = category.strip().lower()
    q = q.strip()

    filtered = []
    for project in projects:
        if not _matches_query(project, q):
            continue
        if status_l and status_l not in (project.get("status") or "").lower():
            continue
        if category_l:
            key = (project.get("category_key") or "").lower()
            label = (project.get("category") or "").lower()
            if category_l not in key and category_l not in label:
                continue
        filtered.append(project)

    if sort == "name":
        filtered.sort(key=lambda p: (p.get("name") or "").lower())
    elif sort == "oldest":
        filtered.sort(key=lambda p: p.get("last_date") or "")
    else:
        filtered.sort(key=lambda p: p.get("last_date") or "", reverse=True)

    total = len(filtered)
    offset = max(0, offset)
    limit = max(1, min(limit, 100))
    page = filtered[offset : offset + limit]

    statuses = sorted({(p.get("status") or "Unknown") for p in projects})
    categories = sorted(
        {
            (p.get("category_key") or ""): (p.get("category") or "")
            for p in projects
            if p.get("category_key")
        }.items(),
        key=lambda kv: kv[1],
    )
    return {
        "projects": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "filters": {
            "statuses": statuses,
            "categories": [{"key": k, "label": v} for k, v in categories],
        },
    }


def get_project(project_id: str) -> dict[str, Any] | None:
    pid = str(project_id or "").strip()
    if not pid:
        return None
    df = _dataframe()
    items = [
        row
        for row in _rows_with_projects(df)
        if str(row.get("ProjectId") or "").strip() == pid
    ]
    if not items:
        return None
    project = _build_project(pid, items)
    timeline = []
    for row in sorted(items, key=lambda r: row_value(r, "meeting_date") or ""):
        timeline.append(
            {
                "date": row_value(row, "meeting_date") or None,
                "event": row_value(row, "summary")
                or row_value(row, "project_name")
                or "Board action",
                "status": row_value(row, "status", "outcome", "action_taken") or "Unknown",
                "board": row_value(row, "board") or None,
                "application_id": row_value(row, "application_id") or None,
                "document_url": row_value(row, "document_url") or None,
                "record_id": str(row.get("RecordId") or row.get("ItemId") or ""),
            }
        )
    project["timeline"] = timeline
    return project


def recent_activity(
    *,
    days: int = 180,
    limit: int = 40,
    lat: float | None = None,
    lng: float | None = None,
    radius_miles: float | None = None,
) -> dict[str, Any]:
    """Flat recent board actions that belong to a project, newest first."""
    from datetime import date, timedelta

    df = _dataframe()
    items = _rows_with_projects(df)
    cutoff = None
    if days > 0:
        cutoff = (date.today() - timedelta(days=days)).isoformat()

    activity: list[dict[str, Any]] = []
    for row in items:
        meeting_date = row_value(row, "meeting_date")
        if cutoff and (not meeting_date or meeting_date < cutoff):
            continue
        item_lat = _nullable_float(row.get("Latitude") or row.get("Lat"))
        item_lng = _nullable_float(row.get("Longitude") or row.get("Lon") or row.get("Lng"))
        miles = None
        if lat is not None and lng is not None and item_lat is not None and item_lng is not None:
            miles = haversine_miles(lat, lng, item_lat, item_lng)
            if radius_miles is not None and miles > radius_miles:
                continue
        activity.append(
            {
                "project_id": str(row.get("ProjectId") or "").strip(),
                "name": row_value(row, "project_name") or "Untitled project",
                "date": meeting_date or None,
                "status": row_value(row, "status", "outcome", "action_taken") or None,
                "board": row_value(row, "board") or None,
                "summary": row_value(row, "summary") or None,
                "application_id": row_value(row, "application_id") or None,
                "location": row_value(row, "location") or None,
                "category": category_label(str(row.get("LandUseCategory") or "")),
                "document_url": row_value(row, "document_url") or None,
                "lat": item_lat,
                "lng": item_lng,
                "distance_miles": round(miles, 2) if miles is not None else None,
            }
        )

    activity.sort(key=lambda a: a.get("date") or "", reverse=True)
    limit = max(1, min(limit, 100))
    return {"activity": activity[:limit], "total": len(activity), "days": days}


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearby_projects(
    *,
    lat: float,
    lng: float,
    radius_miles: float = 2.0,
    limit: int = 25,
) -> list[dict[str, Any]]:
    projects = []
    for project in list_projects_index():
        plat, plng = project.get("lat"), project.get("lng")
        if plat is None or plng is None:
            continue
        miles = haversine_miles(lat, lng, float(plat), float(plng))
        if miles > radius_miles:
            continue
        item = dict(project)
        item["distance_miles"] = round(miles, 2)
        projects.append(item)
    # Stable sort: newest activity first, then nearest first.
    projects.sort(key=lambda p: p.get("last_date") or "", reverse=True)
    projects.sort(key=lambda p: p.get("distance_miles") if p.get("distance_miles") is not None else 999.0)
    return projects[: max(1, min(limit, 100))]


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_plausible_email(value: str) -> bool:
    return bool(_EMAIL_RE.match((value or "").strip()))
