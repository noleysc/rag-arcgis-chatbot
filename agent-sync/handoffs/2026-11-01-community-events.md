# Handoff — cloud agent → Nolan (2026-11-01)

## Done

- Root cause: `frontend-react/public/community-events.json` only had Farmers Market
  dates through **2026-10-29** (plus a Sep bird walk). On/after **2026-11-01**,
  `fetch_manual_events()` returned `[]`, so CI failed
  `test_manual_events_load_from_public_json` and Pulse/chat stopped showing the
  manual Farmers Market seed.
- Quick fix: replaced past entries with Thursday Coconut Point Farmers Market dates
  **2026-11-05 through 2027-03-25**.
- Lasting fix: `test_manual_events_load_from_public_json` now loads a tmp fixture
  with dates relative to `date.today()` (past + upcoming) via `_CANDIDATES`
  monkeypatch — no longer depends on the live seed file having future dates.

## Next / verify

1. Merge PR → VPS deploy picks up new `community-events.json`; Farmers Market
   should reappear on Community Pulse / events chat.
2. Confirm CI green on `test_manual_events_load_from_public_json`.
3. Before **2027-03-25**, extend Thursday dates again (or automate generation).

## Note

`engage-estero-sync` MCP was unavailable in this cloud environment; handoff
written to git directly. Events/QA remain Nolan's area.
