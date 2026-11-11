# Handoff — projects tracker + nearby subscribe

**From:** cloud-agent  
**To:** nolan / ethan / krish  
**Date:** 2026-11-09

## Done

- Backend project aggregation from gold `ProjectId` (`/api/projects`, `/api/projects/{id}`, `/api/activity/recent`)
- Nearby preview + email subscribe store (`/api/nearby/preview|subscribe|unsubscribe`, admin list)
- React `#/projects` with All / What's happening / Near me + dossier
- Home cards point at Projects; QA checklist section added
- Tests: `backend/tests/test_projects_nearby.py` (10 passing)

## Next

- Wire SMTP/digest cron to `data/ops/nearby_subscriptions.json` (storage only today)
- Optional: demote Pulse further; MapView Phase 1 still open in `docs/MAP_UX_PLAN.md`

## Verify

- `cd backend && pytest tests/test_projects_nearby.py -q`
- UI: `#/projects`, `#/projects?tab=recent`, `#/projects?tab=nearby`
