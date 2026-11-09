"""Projects browse, recent activity, and nearby subscription APIs."""
from __future__ import annotations

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    subs_file = tmp_path / "nearby_subscriptions.json"
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setenv("NEARBY_SUBSCRIPTIONS_FILE", str(subs_file))
    monkeypatch.setenv("SERVE_FRONTEND", "false")
    monkeypatch.setenv("ENABLE_RATE_LIMIT", "false")

    import admin_auth
    import config
    import nearby_subscriptions
    import rate_limit

    monkeypatch.setattr(config, "ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setattr(config, "NEARBY_SUBSCRIPTIONS_FILE", str(subs_file))
    monkeypatch.setattr(admin_auth, "ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setattr(nearby_subscriptions, "SUBSCRIPTIONS_FILE", str(subs_file))
    monkeypatch.setattr(config, "ENABLE_RATE_LIMIT", False)
    rate_limit.get_limiter().reset()

    import app as backend_app

    return TestClient(backend_app.app)


def test_projects_routes_registered():
    import app as backend_app

    paths = set(backend_app.app.openapi().get("paths", {}))
    assert {
        "/api/projects",
        "/api/projects/{project_id}",
        "/api/activity/recent",
        "/api/nearby/preview",
        "/api/nearby/subscribe",
        "/api/nearby/unsubscribe",
        "/admin/nearby-subscriptions",
    }.issubset(paths)


def test_list_projects_returns_page(client):
    res = client.get("/api/projects", params={"limit": 10})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] > 0
    assert len(body["projects"]) <= 10
    row = body["projects"][0]
    assert row["project_id"]
    assert row["name"]
    assert "filters" in body
    assert body["filters"]["statuses"]


def test_list_projects_search_and_status(client):
    listed = client.get("/api/projects", params={"limit": 5}).json()
    status = listed["projects"][0]["status"]
    filtered = client.get("/api/projects", params={"status": status, "limit": 20}).json()
    assert filtered["total"] >= 1
    assert all(status.lower() in (p["status"] or "").lower() for p in filtered["projects"])

    q = (listed["projects"][0].get("application_id") or listed["projects"][0]["name"].split()[0])[:12]
    searched = client.get("/api/projects", params={"q": q, "limit": 20}).json()
    assert searched["total"] >= 1


def test_project_detail_has_timeline(client):
    listed = client.get("/api/projects", params={"limit": 1, "sort": "recent"}).json()
    pid = listed["projects"][0]["project_id"]
    res = client.get(f"/api/projects/{pid}")
    assert res.status_code == 200
    body = res.json()
    assert body["project_id"] == pid
    assert isinstance(body["timeline"], list)
    assert len(body["timeline"]) >= 1


def test_project_detail_404(client):
    assert client.get("/api/projects/does-not-exist-999999").status_code == 404


def test_recent_activity(client):
    res = client.get("/api/activity/recent", params={"days": 3650, "limit": 15})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    assert len(body["activity"]) <= 15
    assert body["activity"][0]["project_id"]
    assert body["activity"][0]["date"]


def test_nearby_preview_with_coords(client):
    # Corkscrew / Estero area — many geocoded projects nearby.
    res = client.post(
        "/api/nearby/preview",
        json={"address": "Estero", "lat": 26.438, "lng": -81.807, "radius_miles": 3, "limit": 10},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["geocode"]["lat"] == pytest.approx(26.438)
    assert isinstance(body["projects"], list)


def test_nearby_subscribe_and_unsubscribe(client, monkeypatch):
    import nearby_subscriptions

    monkeypatch.setattr(
        nearby_subscriptions,
        "preview_nearby",
        lambda **kwargs: {
            "ok": True,
            "error": None,
            "geocode": {
                "lat": 26.44,
                "lng": -81.81,
                "display_name": "123 Main St, Estero, FL",
                "source": "test",
                "confidence": 1.0,
            },
            "radius_miles": 2.0,
            "projects": [],
            "activity": [],
        },
    )

    created = client.post(
        "/api/nearby/subscribe",
        json={
            "email": "resident@example.com",
            "address": "123 Main St, Estero, FL",
            "radius_miles": 2,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["subscription"]["email"] == "resident@example.com"
    token = body["subscription"]["unsubscribe_token"]
    assert token

    denied = client.get("/admin/nearby-subscriptions")
    assert denied.status_code == 401
    admin = client.get(
        "/admin/nearby-subscriptions",
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert admin.status_code == 200
    assert admin.json()["counts"]["active"] == 1

    gone = client.post("/api/nearby/unsubscribe", json={"token": token})
    assert gone.status_code == 200
    assert gone.json()["status"] == "unsubscribed"

    admin2 = client.get(
        "/admin/nearby-subscriptions",
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert admin2.json()["counts"]["active"] == 0


def test_nearby_subscribe_rejects_bad_email(client):
    res = client.post(
        "/api/nearby/subscribe",
        json={"email": "not-an-email", "address": "123 Main St, Estero, FL"},
    )
    assert res.status_code == 400


def test_haversine_and_email_helpers():
    from projects_service import haversine_miles, is_plausible_email

    assert haversine_miles(26.44, -81.81, 26.44, -81.81) == pytest.approx(0.0, abs=1e-6)
    assert haversine_miles(26.44, -81.81, 26.45, -81.81) < 1.0
    assert is_plausible_email("a@b.co")
    assert not is_plausible_email("nope")
