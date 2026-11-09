"""Persist nearby development-alert subscriptions (email + address).

Email delivery is out of band for now — this store is the opt-in inbox a
cron/digest can read later. Subscribe responses still return a live nearby
preview so the UI is useful immediately.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from config import NEARBY_SUBSCRIPTIONS_FILE
from geocode import geocode_address
from projects_service import is_plausible_email, nearby_projects, recent_activity

SUBSCRIPTIONS_FILE = NEARBY_SUBSCRIPTIONS_FILE

_lock = threading.Lock()
DEFAULT_RADIUS_MILES = 2.0
MIN_RADIUS = 0.25
MAX_RADIUS = 10.0


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _ensure_parent() -> None:
    parent = os.path.dirname(SUBSCRIPTIONS_FILE)
    if parent:
        os.makedirs(parent, exist_ok=True)


def _read_all() -> list[dict[str, Any]]:
    if not os.path.isfile(SUBSCRIPTIONS_FILE):
        return []
    with open(SUBSCRIPTIONS_FILE, encoding="utf-8") as f:
        raw = f.read().strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("nearby subscriptions file must be a JSON array")
    return data


def _write_all(rows: list[dict[str, Any]]) -> None:
    _ensure_parent()
    tmp = SUBSCRIPTIONS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, SUBSCRIPTIONS_FILE)


def _clamp_radius(radius_miles: float | None) -> float:
    value = DEFAULT_RADIUS_MILES if radius_miles is None else float(radius_miles)
    return max(MIN_RADIUS, min(MAX_RADIUS, value))


def _public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "email": row["email"],
        "address": row["address"],
        "display_name": row.get("display_name") or row["address"],
        "lat": row["lat"],
        "lng": row["lng"],
        "radius_miles": row["radius_miles"],
        "status": row.get("status", "active"),
        "unsubscribe_token": row["unsubscribe_token"],
    }


def preview_nearby(
    *,
    address: str,
    lat: float | None = None,
    lng: float | None = None,
    radius_miles: float | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    radius = _clamp_radius(radius_miles)
    resolved = None
    if lat is not None and lng is not None:
        resolved = {
            "lat": float(lat),
            "lng": float(lng),
            "display_name": address.strip() or f"{lat}, {lng}",
            "source": "client",
            "confidence": 1.0,
        }
    else:
        resolved = geocode_address(address)
        if not resolved:
            return {
                "ok": False,
                "error": "Could not locate that address in the Estero area. Try a fuller street address.",
                "projects": [],
                "activity": [],
            }

    projects = nearby_projects(
        lat=resolved["lat"],
        lng=resolved["lng"],
        radius_miles=radius,
        limit=limit,
    )
    activity = recent_activity(
        days=365,
        limit=limit,
        lat=resolved["lat"],
        lng=resolved["lng"],
        radius_miles=radius,
    )["activity"]
    return {
        "ok": True,
        "error": None,
        "geocode": resolved,
        "radius_miles": radius,
        "projects": projects,
        "activity": activity,
    }


def create_subscription(
    *,
    email: str,
    address: str,
    radius_miles: float | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, Any]:
    email_clean = (email or "").strip().lower()
    address_clean = (address or "").strip()
    if not is_plausible_email(email_clean):
        raise ValueError("Enter a valid email address.")
    if len(address_clean) < 5:
        raise ValueError("Enter the street address where you live.")

    preview = preview_nearby(
        address=address_clean,
        lat=lat,
        lng=lng,
        radius_miles=radius_miles,
        limit=15,
    )
    if not preview.get("ok"):
        raise ValueError(preview.get("error") or "Could not geocode address.")

    geo = preview["geocode"]
    radius = preview["radius_miles"]
    token = secrets.token_urlsafe(24)
    row = {
        "id": str(uuid.uuid4()),
        "created_at": _utc_now(),
        "email": email_clean,
        "email_hash": hashlib.sha256(email_clean.encode()).hexdigest()[:16],
        "address": address_clean,
        "display_name": geo.get("display_name") or address_clean,
        "lat": geo["lat"],
        "lng": geo["lng"],
        "radius_miles": radius,
        "geocode_source": geo.get("source"),
        "status": "active",
        "unsubscribe_token": token,
    }

    with _lock:
        rows = _read_all()
        # Upsert by email: refresh address/radius rather than stack duplicates.
        replaced = False
        for i, existing in enumerate(rows):
            if existing.get("email") == email_clean and existing.get("status") == "active":
                row["id"] = existing.get("id") or row["id"]
                row["created_at"] = existing.get("created_at") or row["created_at"]
                rows[i] = row
                replaced = True
                break
        if not replaced:
            rows.insert(0, row)
        _write_all(rows)

    return {
        "subscription": _public_row(row),
        "projects": preview["projects"],
        "activity": preview["activity"],
        "message": (
            "You're subscribed to nearby development alerts for this address. "
            "We'll email updates when new board activity is recorded nearby."
        ),
    }


def unsubscribe(token: str) -> dict[str, Any]:
    cleaned = (token or "").strip()
    if not cleaned:
        raise ValueError("Missing unsubscribe token.")
    with _lock:
        rows = _read_all()
        for i, row in enumerate(rows):
            if row.get("unsubscribe_token") == cleaned:
                row["status"] = "unsubscribed"
                row["unsubscribed_at"] = _utc_now()
                rows[i] = row
                _write_all(rows)
                return {"ok": True, "id": row.get("id"), "status": "unsubscribed"}
    raise KeyError(cleaned)


def list_subscriptions(*, active_only: bool = True) -> list[dict[str, Any]]:
    with _lock:
        rows = _read_all()
    if active_only:
        rows = [r for r in rows if r.get("status") == "active"]
    return [_public_row(r) for r in rows]


def subscription_counts() -> dict[str, int]:
    with _lock:
        rows = _read_all()
    active = sum(1 for r in rows if r.get("status") == "active")
    return {"total": len(rows), "active": active, "unsubscribed": len(rows) - active}
