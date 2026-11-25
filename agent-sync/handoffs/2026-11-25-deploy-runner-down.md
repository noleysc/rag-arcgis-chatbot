# Handoff: Deploy runner lost GitHub during meeting-videos push

**From:** nolan (cloud agent)  
**To:** ethan / whoever SSHs the VPS  
**Date:** 2026-11-25 (America/New_York)

## Done

- Confirmed failed run: [Deploy to VPS #26](https://github.com/noleysc/rag-arcgis-chatbot/actions/runs/45653310098) on commit `6e265c0` (meeting video links, #42).
- Runner name: `engage-estero-vps` (labels `self-hosted`, `linux`, `engage-estero`).
- Job annotation: *“The self-hosted runner lost communication with the server…”* (GitHub lists OOM / runner process kill / network as causes).
- “Rebuild and restart” never finished; no step logs uploaded.
- Died after ~11 min; healthy deploys on this runner take ~17–20 min for the same `docker compose up -d --build` step.
- Follow-up [Deploy to VPS #27](https://github.com/noleysc/rag-arcgis-chatbot/actions/runs/45654740777) (`workflow_dispatch`) still **queued** → runner is **offline now**.
- Site OK: `https://tracker.esterotoday.com/health` → `status: ok` (old container still serving).
- Cloud CI (lint/pytest/pipeline) for that push was green; only VPS deploy failed.
- No SSH from this cloud agent; could not inspect `actions.runner` / dmesg / free memory on the box.

## Next (on the VPS as root)

```bash
# 1) Is the runner service up?
systemctl list-units --type=service --all | grep -i actions.runner
# typical unit looks like: actions.runner.<org|repo>.engage-estero-vps.service
systemctl status 'actions.runner.*.service' --no-pager
journalctl -u 'actions.runner.*.service' -n 80 --no-pager

# 2) Did the build OOM?
dmesg -T | grep -iE 'oom|killed process|out of memory' | tail -40
journalctl -k -n 100 --no-pager | grep -iE 'oom|killed'
free -h
docker system df

# 3) Bring runner back, then finish deploy
systemctl restart 'actions.runner.*.service'
# once GitHub shows the runner online, either wait for queued run #27
# or: sudo update-engage-estero
```

## Verify

- Runner online in GitHub → Settings → Actions → Runners (`engage-estero-vps`).
- Queued deploy #27 completes, or manual `sudo update-engage-estero` succeeds.
- `/health` still ok; Board Records / chat show meeting video links from `6e265c0`.
