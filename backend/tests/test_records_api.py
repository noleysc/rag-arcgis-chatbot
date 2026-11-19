"""Board Records API (records_api.py), exercised through FastAPI's test
client on a minimal app so the ML models are never loaded."""
from __future__ import annotations

import os
import sys
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

import records_api  # noqa: E402
from schema_aliases import load_dataframe  # noqa: E402

GOLD_CSV = os.path.join(BACKEND, "data", "gold", "meetings_ai_public.csv")

MINUTES_A = "https://estero-fl.gov/minutes/10072026.pdf"
MINUTES_B = "https://estero-fl.gov/minutes/09152026-PZDB.pdf"
MINUTES_C = "https://estero-fl.gov/minutes/01032018.pdf"


def _sample() -> pd.DataFrame:
    """Gold-schema rows, as store.py loads them (ApplicationId/PrimarySourceUrl
    already renamed by schema_aliases.load_dataframe)."""
    return pd.DataFrame(
        [
            # Oct 7 Council meeting: two items on one minutes PDF.
            {"ProjectName": None, "ProjectTitle": "Approval of Agenda", "MeetingDate": "2026-10-07",
             "Board": "Village Council", "AgendaItemType": "Consent Agenda", "ActionTaken": "Approved agenda",
             "ApplicationID": None, "Document_Link": MINUTES_A},
            {"ProjectName": "Sandy Lane Extension", "ProjectTitle": "Sandy Lane", "MeetingDate": "2026-10-07",
             "Board": "Village Council", "AgendaItemType": "Resolution", "ActionTaken": "Adopted Resolution 2026-11",
             "ApplicationID": None, "Document_Link": MINUTES_A},
            {"ProjectName": "Wawa - Estero Town Commons", "ProjectTitle": "Wawa", "MeetingDate": "2026-09-15",
             "Board": "Planning Zoning & Design Board", "AgendaItemType": "Public Comment",
             "ActionTaken": "No formal action recorded.", "ApplicationID": "DOS2022-E016", "Document_Link": MINUTES_B},
            {"ProjectName": "Budget Workshop", "ProjectTitle": "Budget", "MeetingDate": "2018-01-03",
             "Board": "Village Council", "AgendaItemType": "Unknown", "ActionTaken": None,
             "ApplicationID": None, "Document_Link": MINUTES_C},
        ]
    )


@pytest.fixture()
def client(monkeypatch):
    store = SimpleNamespace(dataframe=_sample())
    monkeypatch.setattr(records_api, "get_store", lambda: store)
    records_api._cache.update(source_id=None, frame=None)
    app = FastAPI()
    app.include_router(records_api.router)
    return TestClient(app)


def test_newest_first_with_agenda_order_and_title_fallback(client):
    body = client.get("/api/records").json()
    assert body["total"] == 4
    assert [r["date"] for r in body["records"]] == ["2026-10-07", "2026-10-07", "2026-09-15", "2018-01-03"]
    # Same meeting: later agenda item first (mirrors the old ObjectId DESC tie-break).
    assert [r["title"] for r in body["records"][:2]] == ["Sandy Lane Extension", "Approval of Agenda"]
    first = body["records"][0]
    assert set(first) == {
        "id", "title", "date", "board", "item_type", "action", "application_id", "minutes_url", "video",
    }
    assert first["minutes_url"] == MINUTES_A


def test_unknown_item_type_and_missing_values_are_blank(client):
    budget = client.get("/api/records", params={"sort": "oldest"}).json()["records"][0]
    assert budget["title"] == "Budget Workshop"
    assert budget["item_type"] == ""
    assert budget["action"] == ""
    assert budget["application_id"] == ""


def test_decisions_board_and_search_filters(client):
    decisions = client.get("/api/records", params={"view": "decisions"}).json()
    assert {r["item_type"] for r in decisions["records"]} == {"Consent Agenda", "Resolution"}
    pzdb = client.get("/api/records", params={"board": "Planning Zoning & Design Board"}).json()
    assert pzdb["total"] == 1 and pzdb["records"][0]["application_id"] == "DOS2022-E016"
    # Case-insensitive; every word must match; searches title, action and ID.
    assert client.get("/api/records", params={"q": "sandy RESOLUTION"}).json()["total"] == 1
    assert client.get("/api/records", params={"q": "dos2022-e016"}).json()["total"] == 1
    assert client.get("/api/records", params={"q": "no-such-thing"}).json()["total"] == 0
    # Regex/LIKE metacharacters are matched literally.
    assert client.get("/api/records", params={"q": "2026-1%"}).json()["total"] == 0


def test_sorting_and_paging(client):
    titles = [r["title"] for r in client.get("/api/records", params={"sort": "title"}).json()["records"]]
    assert titles == sorted(titles, key=str.lower)
    page2 = client.get("/api/records", params={"offset": 2, "limit": 2}).json()
    assert page2["total"] == 4 and [r["date"] for r in page2["records"]] == ["2026-09-15", "2018-01-03"]
    assert client.get("/api/records", params={"limit": 500}).status_code == 422
    assert client.get("/api/records", params={"sort": "random"}).status_code == 422


def test_boards_minutes_and_summary(client):
    assert client.get("/api/records/boards").json() == {
        "boards": ["Planning Zoning & Design Board", "Village Council"]
    }
    docs = client.get("/api/records/minutes").json()["docs"]
    assert [d["url"] for d in docs] == [MINUTES_A, MINUTES_B, MINUTES_C]  # one per PDF, newest first
    assert docs[0] == {"date": "2026-10-07", "board": "Village Council", "url": MINUTES_A}
    assert [d["url"] for d in client.get("/api/records/minutes", params={"q": "wawa"}).json()["docs"]] == [MINUTES_B]
    assert client.get("/api/records/summary").json() == {
        "total": 4,
        "latest_meeting": "2026-10-07",
        "first_meeting": "2018-01-03",
    }


def test_no_data_loaded_is_503(monkeypatch):
    monkeypatch.setattr(records_api, "get_store", lambda: None)
    records_api._cache.update(source_id=None, frame=None)
    app = FastAPI()
    app.include_router(records_api.router)
    assert TestClient(app).get("/api/records").status_code == 503


@pytest.mark.skipif(not os.path.exists(GOLD_CSV), reason="gold CSV not present")
def test_real_dataset_reaches_the_newest_meeting(monkeypatch):
    """The page must show every agenda item the chatbot knows about, up to
    the newest meeting in the pipeline's gold file."""
    df = load_dataframe(GOLD_CSV)
    store = SimpleNamespace(dataframe=df)
    monkeypatch.setattr(records_api, "get_store", lambda: store)
    records_api._cache.update(source_id=None, frame=None)
    app = FastAPI()
    app.include_router(records_api.router)
    client = TestClient(app)

    summary = client.get("/api/records/summary").json()
    assert summary["total"] == len(df)
    assert summary["latest_meeting"] == str(df["MeetingDate"].max())[:10]
    newest = client.get("/api/records", params={"limit": 1}).json()["records"][0]
    assert newest["date"] == summary["latest_meeting"]
    assert all(r["title"] for r in client.get("/api/records", params={"limit": 100}).json()["records"])
