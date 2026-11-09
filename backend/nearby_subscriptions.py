"""Persist nearby development-alert subscriptions (email + address).

Subscribe responses return a live nearby preview. Digests are sent by
``run_nearby_digests`` / ``backend/scripts/send_nearby_digests.py`` when SMTP
is configured.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from config import NEARBY_SUBSCRIPTIONS_FILE
from email_digest import compose_nearby_digest, send_email, smtp_configured
from geocode import geocode_address
from projects_service import is_plausible_email, nearby_projects, recent_activity

logger = logging.getLogger(__name__)

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
        "last_sent_at": row.get("last_sent_at"),
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
                row["last_sent_at"] = existing.get("last_sent_at")
                row["unsubscribe_token"] = existing.get("unsubscribe_token") or row["unsubscribe_token"]
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


def activity_since(row: dict[str, Any], *, lookback_days: int = 400) -> list[dict[str, Any]]:
    """Board activity inside the subscription radius newer than last_sent_at."""
    since = (row.get("last_sent_at") or row.get("created_at") or "")[:10]
    activity = recent_activity(
        days=lookback_days,
        limit=50,
        lat=float(row["lat"]),
        lng=float(row["lng"]),
        radius_miles=float(row.get("radius_miles") or DEFAULT_RADIUS_MILES),
    )["activity"]
    if not since:
        return activity
    return [a for a in activity if (a.get("date") or "") > since]


def mark_digest_sent(subscription_id: str, *, sent_at: str | None = None) -> None:
    stamp = sent_at or _utc_now()
    with _lock:
        rows = _read_all()
        for i, row in enumerate(rows):
            if row.get("id") == subscription_id:
                row["last_sent_at"] = stamp
                rows[i] = row
                _write_all(rows)
                return
    raise KeyError(subscription_id)


def run_nearby_digests(*, dry_run: bool = False, lookback_days: int = 400) -> dict[str, Any]:
    """Send digests for every active subscription with new nearby activity."""
    with _lock:
        rows = [r for r in _read_all() if r.get("status") == "active"]

    sent = 0
    skipped = 0
    errors: list[str] = []
    for row in rows:
        try:
            activity = activity_since(row, lookback_days=lookback_days)
            if not activity:
                skipped += 1
                continue
            subject, text, html = compose_nearby_digest(
                display_name=row.get("display_name") or row.get("address") or "your address",
                radius_miles=float(row.get("radius_miles") or DEFAULT_RADIUS_MILES),
                activity=activity,
                unsubscribe_token=row["unsubscribe_token"],
            )
            if dry_run:
                logger.info(
                    "dry-run digest to %s (%d items): %s",
                    row.get("email"),
                    len(activity),
                    subject,
                )
                sent += 1
                continue
            if not smtp_configured():
                raise RuntimeError("SMTP is not configured")
            send_email(to=row["email"], subject=subject, text=text, html=html)
            mark_digest_sent(row["id"])
            sent += 1
        except Exception as exc:  # noqa: BLE001 — continue other subscribers
            logger.exception("Digest failed for %s", row.get("email"))
            errors.append(f"{row.get('email')}: {exc}")

    return {
        "sent": sent,
        "skipped": skipped,
        "errors": errors,
        "smtp_configured": smtp_configured(),
        "dry_run": dry_run,
        "active_subscriptions": len(rows),
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
