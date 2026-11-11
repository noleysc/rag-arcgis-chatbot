"""Resolve street addresses to lat/lng for nearby subscriptions.

Order:
1. Exact / normalized match against the bronze geocode cache
2. Nominatim (OpenStreetMap), biased to Estero / Lee County
"""
from __future__ import annotations

import csv
import logging
import os
import re
import time
from typing import Any

import requests

from config import DATA_DIR

logger = logging.getLogger(__name__)

GEOCODE_CACHE_PATH = os.getenv(
    "GEOCODE_CACHE_PATH",
    os.path.join(DATA_DIR, "bronze", "geocoded_locations.csv"),
)

# Approximate Estero bounding box used to bias Nominatim and reject far hits.
ESTERO_VIEWBOX = (-81.90, 26.30, -81.70, 26.52)  # west, south, east, north
ESTERO_CENTER = (26.438, -81.807)
USER_AGENT = os.getenv(
    "GEOCODE_USER_AGENT",
    "EngageEsteroTracker/1.0 (nearby alerts; https://tracker.esterotoday.com)",
)

_cache_rows: list[dict[str, str]] | None = None
_cache_mtime: float | None = None
_last_nominatim_at = 0.0


def normalize_address_key(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace(".", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r",\s*", ", ", text)
    return text


def _load_cache() -> list[dict[str, str]]:
    global _cache_rows, _cache_mtime
    path = GEOCODE_CACHE_PATH
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        _cache_rows = []
        _cache_mtime = None
        return []
    if _cache_rows is not None and _cache_mtime == mtime:
        return _cache_rows
    rows: list[dict[str, str]] = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rows.append({k: (v or "").strip() for k, v in row.items()})
    _cache_rows = rows
    _cache_mtime = mtime
    return rows


def _in_estero_box(lat: float, lng: float) -> bool:
    west, south, east, north = ESTERO_VIEWBOX
    return south <= lat <= north and west <= lng <= east


def _cache_lookup(address: str) -> dict[str, Any] | None:
    key = normalize_address_key(address)
    if not key:
        return None
    for row in _load_cache():
        loc = normalize_address_key(row.get("Location", ""))
        display = normalize_address_key(row.get("DisplayName", ""))
        if key == loc or key in loc or loc in key or (display and key in display):
            try:
                lat = float(row["Latitude"])
                lng = float(row["Longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            return {
                "lat": lat,
                "lng": lng,
                "display_name": row.get("DisplayName") or row.get("Location") or address,
                "source": row.get("GeocodeSource") or "cache",
                "confidence": float(row.get("GeocodeConfidence") or 0.7),
            }
    return None


def _nominatim_lookup(address: str) -> dict[str, Any] | None:
    global _last_nominatim_at
    # Nominatim usage policy: max 1 request/second.
    elapsed = time.monotonic() - _last_nominatim_at
    if elapsed < 1.05:
        time.sleep(1.05 - elapsed)

    query = address.strip()
    if "estero" not in query.lower():
        query = f"{query}, Estero, FL"
    west, south, east, north = ESTERO_VIEWBOX
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
        "viewbox": f"{west},{north},{east},{south}",
        "bounded": 0,
        "countrycodes": "us",
    }
    headers = {"User-Agent": USER_AGENT}
    try:
        _last_nominatim_at = time.monotonic()
        res = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=headers,
            timeout=8,
        )
        res.raise_for_status()
        data = res.json()
    except Exception as exc:  # noqa: BLE001 — soft-fail geocode
        logger.warning("Nominatim geocode failed: %s", exc)
        return None
    if not data:
        return None
    hit = data[0]
    try:
        lat = float(hit["lat"])
        lng = float(hit["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not _in_estero_box(lat, lng):
        # Accept Lee County-adjacent hits within ~15 mi of Estero center.
        from projects_service import haversine_miles

        if haversine_miles(ESTERO_CENTER[0], ESTERO_CENTER[1], lat, lng) > 15:
            return None
    return {
        "lat": lat,
        "lng": lng,
        "display_name": hit.get("display_name") or address,
        "source": "nominatim",
        "confidence": float(hit.get("importance") or 0.5),
    }


def geocode_address(address: str) -> dict[str, Any] | None:
    """Return ``{lat, lng, display_name, source, confidence}`` or None."""
    cleaned = (address or "").strip()
    if len(cleaned) < 5:
        return None
    cached = _cache_lookup(cleaned)
    if cached:
        return cached
    return _nominatim_lookup(cleaned)
