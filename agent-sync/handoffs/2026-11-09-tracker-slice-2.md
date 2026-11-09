# Handoff — tracker slice 2 (digests, MapView, home)

**From:** cloud-agent  
**To:** nolan / ethan / krish  
**Date:** 2026-11-09

## Done (on `cursor/projects-nearby-subscribe-b44c`)

1. **Nearby email digests** — `email_digest.py`, `run_nearby_digests`, `scripts/send_nearby_digests.py`, VPS `deploy/vps/send-nearby-digests.sh`, admin dry-run endpoint. Needs SMTP_* in `deploy/vps/.env`.
2. **Embedded MapView** — MapPanel loads webmap `84a56d…` via `@arcgis/core`; Instant App kept as “Open full map”.
3. **Richer dossiers** — category chip, parcel thumb, related corridor projects, Ask cards → Project details (`project_id` on `ProjectOut`).
4. **Home as tracker** — Under review / Recently decided / Near you; brand-led hero.
5. **Pulse demoted** — nav label **Events**, last in sidebar; home no longer Pulse-first.

## Verify

- `pytest tests/test_projects_nearby.py -q`
- Map: Show on map from Ask / dossier pans
- Home tracker panels + `#/projects?tab=nearby`
- Optional: set SMTP and `./deploy/vps/send-nearby-digests.sh --dry-run`
