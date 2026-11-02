# Handoff — cloud agent → Nolan (2026-11-02)

## Done

- Production QA on https://tracker.esterotoday.com/ for FGCU AI Day.
- Health/ready/warmup green; chat routes OK (structured / RAG / events /
  Corkscrew planning not hijacked). Meetings + news + map OK.
- **Bug 1:** Farmers Market seed was deployed as static
  `/community-events.json`, but `events_sources.manual` only looked under
  `frontend-react/public/` and `backend/data/ops/` — neither exists in the
  VPS image (Vite dist is `/app/frontend/`). `/api/events` had `source=manual`
  never present.
  - Fix: add `/app/frontend/community-events.json` candidate; COPY seed into
    `backend/data/ops/` in `backend/Dockerfile`.
- **Bug 2:** EsteroToday tribe API soft-failed entirely — cert leaf-only after
  Oct 2026 renewal (missing Sectigo intermediate). Prod `/api/events` showed
  only `venue` + `lee_county` (sports-heavy, no Village/community chips).
  - Fix: `_get()` tries `verify=True`, retries once with `verify=False` on
    `SSLError` only; log warning.

## Next / verify

1. Merge + VPS deploy.
2. Confirm `/api/events` includes `source=manual` (Coconut Point Farmers Market)
   and `source=esterotoday` (Council / PZDB / community).
3. Pulse chips should show Markets (+ more than Government/Sports).
4. Chat: “When is the Coconut Point Farmers Market?” should hit events path,
   not stale 2017 RAG.
5. Longer-term: ask EsteroToday host to fix the incomplete TLS chain so the
   verify=False fallback can be removed.

## Note

`engage-estero-sync` MCP unavailable here; handoff written to git.
