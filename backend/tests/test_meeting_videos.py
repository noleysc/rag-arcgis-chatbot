"""Meeting-video links: CHAMP event parsing, record → agenda-item matching,
card fields, and the /meeting-videos endpoints."""
from __future__ import annotations

import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import meeting_videos as mv


def _item(aid, title, children=(), desc=""):
    return {"CustomerAgendaItemID": aid, "Title": title, "Description": desc, "Children": list(children)}


def _champ_event(event_id=284, date="2026-11-18 09:30:00", title="Village Council Meeting"):
    """A trimmed CHAMP /event/{id} payload in the API's own shape."""
    agenda = [
        _item(1, "CALL TO ORDER"),
        _item(2, "CONSENT AGENDA", [
            _item(21, "October 28, 2026 Village Council Meeting Minutes"),
            _item(22, "Financial Report for Month ended September 2026"),
        ]),
        _item(3, "ACTION ITEMS", [
            _item(31, "Resolution No. 2026-27 Budget Amendment #2"),
            _item(32, "First Reading of Ordinance No. 2026-27 Tree Protection"),
            _item(33, "Change Order No. 2 to Contract EC 2020-37 with Tetra Tech"),
            _item(34, "Change Order No. 3 to Contract EC 2020-37 with Tetra Tech"),
        ]),
        _item(5, "PUBLIC HEARINGS", [
            _item(51, "Walmart Repaint Color Palette Selection (District 2) 19975 S. Tamiami Trail, "
                      "located at the corner of US 41 and Estero Parkway"),
            _item(52, "Consideration of a request for a code enforcement lien mitigation (case CE-2026-101)"),
            _item(53, "Consideration of a request for a code enforcement lien mitigation (case CE-2026-207)"),
        ]),
        _item(4, "WORKSHOPS", [_item(41, "Bond Sale", desc="<p>Resolution No. 2026-30 bonds</p>")]),
    ]
    timeline = [
        (1, 0, 96), (2, 364, 401), (31, 403, 688), (32, 687, 1265),
        (33, 1266, 1300), (34, 1301, 1422), (41, 5153, 5436),
        (51, 1500, 1700), (52, 1701, 1800), (53, 1801, 1900),
    ]
    return {
        "Event": {
            "CustomerEventID": event_id,
            "EventTitle": title,
            "EventDateTimeCustomerLocal": date,
            "LastModifyDateTimeUTC": "2026-11-18 16:14:23",
        },
        "Agenda": {"AgendaItems": agenda},
        "Timeline": [
            {"ContainerTypeID": 2, "ContainerID": c, "TimeStartSeconds": s, "TimeEndSeconds": e}
            for c, s, e in timeline
        ],
    }


@pytest.fixture()
def index(tmp_path, monkeypatch):
    meetings = [
        mv.parse_event(_champ_event()),
        # Same meeting date on the other board, to prove boards don't mix.
        mv.parse_event(_champ_event(285, "2026-11-18 16:30:00", "Planning Zoning and Design Board Meeting")),
        # Video posted, timeline not added yet.
        {**mv.parse_event(_champ_event(290, "2026-12-02 09:30:00")), "has_timeline": False,
         "segments": []},
    ]
    path = tmp_path / "meetings.json"
    path.write_text(json.dumps({"meetings": meetings}), encoding="utf-8")
    idx = mv.MeetingVideoIndex(str(path))
    monkeypatch.setattr(mv, "_index", idx)
    return idx


def test_parse_event_keeps_timestamps_and_inherits_consent_children():
    meeting = mv.parse_event(_champ_event())
    by_id = {s["agenda_item_id"]: s for s in meeting["segments"]}
    assert meeting["board"] == "vc" and meeting["date"] == "2026-11-18"
    assert meeting["url"] == "https://play.champds.com/esterofl/event/284"
    assert (by_id[31]["start"], by_id[31]["end"]) == (403, 688)
    # Consent sub-items have no timeline entry of their own.
    assert by_id[21]["start"] == 364 and by_id[21]["inherited"] is True
    assert by_id[3]["start"] is None  # a heading with no timestamp of its own
    assert "resolution|2026|30" in by_id[41]["refs"]  # number found in the description


def test_parse_event_skips_clips_and_trainings():
    assert mv.parse_event(_champ_event(title="Clip FEMA Audit from Village Council Meeting")) is None
    assert mv.parse_event(_champ_event(title="Annual Ethics Training")) is None


def test_resolution_number_links_to_its_timestamp(index):
    clip = index.clip_for("2026-11-18", "Village Council", "Resolution No. 2026-27 Adopting Budget Amendment #2")
    assert clip.match == "ref"
    assert clip.url == "https://play.champds.com/esterofl/event/284/s/403"
    assert clip.label == "Watch discussion (6:43)"


def test_resolution_and_ordinance_with_same_number_stay_apart(index):
    clip = index.clip_for("2026-11-18", "Village Council", "Ordinance No. 2026-27 regarding tree protection")
    assert clip.start == 687


def test_application_id_alone_can_match(index):
    clip = index.clip_for("2026-11-18", "Village Council", "Bond issuance", application_id="Resolution No. 2026-30")
    assert clip.start == 5153


def test_change_orders_on_one_contract_tie_break_by_title(index):
    clip = index.clip_for("2026-11-18", "Village Council", "Change Order No. 3 to Contract EC 2020-37 STA 1")
    assert clip.start == 1301


def test_consent_minutes_match_their_own_date_only(index):
    clip = index.clip_for("2026-11-18", "Village Council", "October 28, 2026 Village Council Meeting Minutes")
    assert clip.start == 364
    # Minutes of a different meeting must not borrow that link.
    assert index.clip_for("2026-11-18", "Village Council", "October 14, 2026 Village Council Meeting Minutes") is None


def test_run_on_descriptions_still_match_on_the_item_name(index):
    # Regression: the minutes' title continues with its own description, so
    # its numbers ("February 10th") and CHAMP's ("19975") used to veto the
    # match and the card fell back to the whole-meeting video.
    clip = index.clip_for(
        "2026-11-18", "Planning Zoning & Design Board",
        "Walmart Repaint Color Palette Selection (District 2) Continued from the February 10th "
        "meeting. Applicant has revised the color scheme presented at the February 10th meeting",
    )
    assert clip.start == 1500


def test_items_sharing_a_name_tie_break_on_full_title(index):
    clip = index.clip_for(
        "2026-11-18", "Village Council",
        "Consideration of a request for a code enforcement lien mitigation (case CE-2026-207) Approved",
    )
    assert clip.start == 1801


def test_unmatched_item_gets_no_link_not_the_whole_meeting(index):
    # Only timestamped links are offered; a full-meeting video is never a fallback.
    assert index.clip_for("2026-11-18", "Village Council", "Presentation on hurricane preparedness") is None


def test_single_shared_word_is_not_a_match(index):
    assert index.clip_for("2026-11-18", "Village Council", "Workshops schedule") is None


def test_boards_on_the_same_date_do_not_mix(index):
    clip = index.clip_for("2026-11-18", "Planning Zoning & Design Board", "Resolution No. 2026-27 Budget")
    assert clip.event_id == 285


def test_meeting_without_any_timestamps_gets_no_link(index):
    assert index.clip_for("2026-12-02", "Village Council", "Resolution No. 2026-27 Budget Amendment") is None


def test_nearby_date_can_supply_a_match(index):
    near = index.clip_for("2026-11-19", "Village Council", "Resolution No. 2026-27 Budget Amendment #2")
    assert near.start == 403
    assert index.clip_for("2026-11-19", "Village Council", "Presentation on hurricane preparedness") is None


def test_no_video_before_2025_or_for_unknown_board(index):
    assert index.clip_for("2024-11-18", "Village Council", "Resolution No. 2026-27") is None
    assert index.clip_for("2026-11-18", "Historic Preservation Board", "Resolution No. 2026-27") is None


def test_missing_file_means_no_links(tmp_path):
    idx = mv.MeetingVideoIndex(str(tmp_path / "absent.json"))
    assert idx.clip_for("2026-11-18", "Village Council", "Resolution No. 2026-27") is None


def test_board_record_cards_carry_the_video_link(index):
    from structured_path import _row_to_project

    card = _row_to_project({
        "ProjectName": "Budget Amendment",
        "ProjectTitle": "Resolution No. 2026-27 Budget Amendment #2",
        "MeetingDate": "2026-11-18",
        "Board": "Village Council",
    })
    assert card.video_url.endswith("/event/284/s/403")
    assert card.video_start == 403 and card.video_approximate is False
    old = _row_to_project({"ProjectName": "Old item", "MeetingDate": "2019-01-02", "Board": "Village Council"})
    assert old.video_url == "" and old.video_start is None


def test_records_api_attaches_timestamped_videos(index, monkeypatch):
    """The Board Records page gets each row's video from /api/records."""
    from types import SimpleNamespace

    import pandas as pd
    from fastapi import FastAPI

    import records_api

    df = pd.DataFrame([
        {"ProjectName": "Budget Amendment", "ProjectTitle": "Resolution No. 2026-27 Budget Amendment #2",
         "MeetingDate": "2026-11-18", "Board": "Village Council", "AgendaItemType": "Resolution"},
        {"ProjectName": "Hurricane talk", "ProjectTitle": "Presentation on hurricane preparedness",
         "MeetingDate": "2026-11-18", "Board": "Village Council", "AgendaItemType": "Public Comment"},
        {"ProjectName": "Old item", "ProjectTitle": "Old item", "MeetingDate": "2019-01-02",
         "Board": "Village Council", "AgendaItemType": "Vote"},
    ])
    store = SimpleNamespace(dataframe=df)
    monkeypatch.setattr(records_api, "get_store", lambda: store)
    records_api._cache.update(source_id=None, frame=None)
    app = FastAPI()
    app.include_router(records_api.router)

    rows = {r["title"]: r["video"] for r in TestClient(app).get("/api/records").json()["records"]}
    assert rows["Budget Amendment"] == {
        "url": "https://play.champds.com/esterofl/event/284/s/403",
        "label": "Watch discussion (6:43)",
        "start": 403,
        "approximate": False,
    }
    # No confident match, or before 2025: no link (never a whole-meeting video).
    assert rows["Hurricane talk"] is None
    assert rows["Old item"] is None


# ── Untimed items: transcript and neighbour-gap estimates ──────────────────

def _vtt(lines):
    """[(second, text)] → a WebVTT document."""
    out = ["WEBVTT", ""]
    for n, (t, text) in enumerate(lines, 1):
        out += [str(n), f"00:{t // 60:02d}:{t % 60:02d}.000 --> 00:{t // 60:02d}:{t % 60 + 1:02d}.000", text, ""]
    return "\n".join(out)


def _meeting(items, has_timeline=True):
    """items: (id, title, start|None, end|None, parent_id|None)."""
    segs = []
    titles = {i[0]: i[1] for i in items}
    for aid, title, start, end, parent in items:
        segs.append({
            "agenda_item_id": aid, "title": title, "parent_id": parent,
            "parent_title": titles.get(parent, ""), "refs": [], "start": start, "end": end,
            "inherited": False, "timing": "champ" if start is not None else None,
        })
    return {"event_id": 1, "has_timeline": has_timeline, "segments": segs}


def test_parse_vtt_reads_cue_times():
    cues = mv.parse_vtt(_vtt([(5, "GOOD MORNING."), (75, "NEXT IS THE CONSENT AGENDA.")]))
    assert cues == [(5, "GOOD MORNING."), (75, "NEXT IS THE CONSENT AGENDA.")]


def test_untimed_item_found_in_transcript_between_its_neighbours():
    m = _meeting([
        (1, "CALL TO ORDER", 0, 100, None),
        (2, "Resolution No. 2025-24 notice of intent sewer assessment Sunny Grove", None, None, None),
        (3, "FIRST READING", 900, 1000, None),
    ])
    # An earlier preview mention outside the bounds must not win.
    cues = mv.parse_vtt(_vtt([(50, "LATER: SUNNY GROVE SEWER ASSESSMENT NOTICE"),
                              (640, "RESOLUTION 2025-24, NOTICE OF INTENT,"),
                              (642, "SEWER ASSESSMENT FOR SUNNY GROVE")]))
    mv.fill_untimed(m, cues)
    seg = m["segments"][1]
    assert (seg["start"], seg["timing"]) == (640, "transcript")


def test_untimed_item_without_transcript_takes_the_neighbour_gap():
    m = _meeting([
        (1, "CALL TO ORDER", 0, 258, None),
        (2, "APPROVAL OF AGENDA, ADDITIONS, AND DELETIONS", None, None, None),
        (3, "PUBLIC COMMENT ON NON-AGENDA ITEMS", 258, 265, None),
    ])
    mv.fill_untimed(m, None)
    assert (m["segments"][1]["start"], m["segments"][1]["timing"]) == (258, "gap")


def test_sub_items_of_a_timed_block_stay_inside_it():
    # Regression: consent sub-items were placed by the gap rule at the END of
    # their parent's block (482 s) instead of its start (269 s).
    m = _meeting([
        (1, "CONSENT AGENDA", 269, 482, None),
        (2, "December 18, 2024 Village Council Meeting Minutes", None, None, 1),
        (3, "Financial Report for Month ended October 2024", None, None, 1),
        (4, "ACTION ITEMS", 482, 600, None),
    ])
    cues = mv.parse_vtt(_vtt([(300, "THE FINANCIAL REPORT FOR THE MONTH ENDED OCTOBER 2024")]))
    mv.fill_untimed(m, cues)
    minutes, report = m["segments"][1], m["segments"][2]
    assert minutes["start"] == 269 and minutes["inherited"] is True
    assert report["start"] == 300 and report["timing"] == "transcript"


def test_grandchildren_inherit_through_an_untimed_heading():
    # Regression: Business (timed) → Consent Agenda → minutes; the minutes
    # fell through to the gap rule before Consent Agenda had inherited.
    m = _meeting([
        (1, "BUSINESS", 162, 418, None),
        (2, "Consent Agenda", None, None, 1),
        (3, "Approval of January 14, 2025 meeting minutes.", None, None, 2),
        (4, "PUBLIC INFORMATION MEETING", 419, 539, None),
    ])
    mv.fill_untimed(m, None)
    assert m["segments"][2]["start"] == 162


def test_meeting_without_timeline_is_aligned_in_agenda_order():
    m = _meeting([
        (1, "APPROVAL OF AGENDA, ADDITIONS, AND DELETIONS", None, None, None),
        (2, "CONSENT AGENDA", None, None, None),
        (3, "January 22, 2025 Village Council Meeting Minutes", None, None, 2),
        (4, "Resolution No. 2025-01 Reappoint two Planning Zoning and Design Board members", None, None, None),
    ], has_timeline=False)
    cues = mv.parse_vtt(_vtt([
        (292, "MOTION TO APPROVE THE AGENDA WITH ADDITIONS AND DELETIONS"),
        (645, "NEXT IS THE CONSENT AGENDA."),
        (694, "RESOLUTION 2025-01 TO REAPPOINT TWO PLANNING, ZONING AND DESIGN BOARD MEMBERS"),
    ]))
    mv.fill_untimed(m, cues)
    starts = [s["start"] for s in m["segments"]]
    assert starts == [292, 645, 645, 694]


def test_one_word_heading_needs_tight_bounds():
    m = _meeting([
        (1, "APPROVAL OF AGENDA, ADDITIONS, AND DELETIONS", None, None, None),
        (2, "CONSENT AGENDA", None, None, None),
        (3, "Minutes", None, None, 2),
        (4, "Resolution No. 2025-01 Reappoint two Planning Zoning and Design Board members", None, None, None),
    ], has_timeline=False)
    cues = mv.parse_vtt(_vtt([
        (292, "MOTION TO APPROVE THE AGENDA WITH ADDITIONS AND DELETIONS"),
        (1500, "NEXT IS THE CONSENT AGENDA."),  # too far from both neighbours
        (2000, "RESOLUTION 2025-01 TO REAPPOINT TWO PLANNING, ZONING AND DESIGN BOARD MEMBERS"),
    ]))
    mv.fill_untimed(m, cues)
    assert m["segments"][1]["start"] is None


def test_village_timestamps_are_never_changed():
    m = _meeting([(1, "CALL TO ORDER", 0, 96, None), (2, "Bond Sale discussion item", 5153, 5436, None)])
    mv.fill_untimed(m, mv.parse_vtt(_vtt([(20, "BOND SALE DISCUSSION ITEM")])))
    assert [(s["start"], s["timing"]) for s in m["segments"]] == [(0, "champ"), (5153, "champ")]


def test_estimated_times_are_labelled_approximate(index):
    seg = next(s for s in index.meetings_for("2026-11-18", "Village Council")[0]["segments"]
               if s["agenda_item_id"] == 31)
    seg["timing"] = "transcript"
    clip = index.clip_for("2026-11-18", "Village Council", "Resolution No. 2026-27 Budget Amendment #2")
    assert clip.approximate and clip.label == "Watch discussion (about 6:43)"
    assert clip.to_dict()["approximate"] is True


def test_removed_item_links_the_agenda_approval_vote(index):
    seg = index.meetings_for("2026-11-18", "Village Council")[0]["segments"]
    seg.insert(1, {"agenda_item_id": 9, "title": "APPROVAL OF AGENDA, ADDITIONS, AND DELETIONS",
                   "parent_id": None, "parent_title": "", "refs": [], "start": 326, "end": 354,
                   "inherited": False, "timing": "champ"})
    clip = index.clip_for("2026-11-18", "Village Council", "Council Salaries - DELETED FROM AGENDA")
    assert clip.start == 326 and clip.purpose == "agenda"
    assert clip.label == "Watch agenda approval (5:26)"


def test_abbreviations_match_the_spelled_out_title():
    assert mv.title_overlap("Fiscal Year 2025-2026 Five-Year Capital Improvement Plan Review", "Proposed CIP") >= 0.6
    assert mv.title_overlap("Estero SportsPark Construction Manager at Risk Contract",
                            "Estero SportsPark CMAR Contract") >= 0.6


def test_removed_item_without_a_timed_agenda_vote_gets_no_link(index):
    assert index.clip_for("2026-11-18", "Village Council", "Council Salaries - DELETED FROM AGENDA") is None
