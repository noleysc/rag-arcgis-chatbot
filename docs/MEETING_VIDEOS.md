# Meeting video links

Board records from 2025 on link to the Village's archived meeting video
(CHAMP, `play.champds.com/esterofl`), opened at the moment the agenda item was
discussed.

## Data

- `backend/scripts/sync_meeting_videos.py` reads CHAMP's public JSON API
  (`playapi.champds.com/esterofl/archiveGroupListWithMedia/1` for the list,
  `/event/{id}` per meeting) and writes
  `backend/data/meeting_videos/meetings.json`: per meeting, the agenda items
  with start/end seconds.
- A meeting is re-fetched only when CHAMP's `LastModifyDateTimeUTC` changes.
  That picks up new meetings and timelines the Village adds a day or two after
  a meeting. Re-run it after each meeting (or on a schedule).
- Timelines exist from 2025 only. 2021–2024 videos have none, so they are not
  synced.
- The file is **not** part of the search index, so a sync never changes
  retrieval.

## Matching (`backend/meeting_videos.py`)

A record is matched to an agenda item in the same board's meeting on the same
date:

1. Same resolution/ordinance number (`2025-22`) in the record's title or
   ApplicationID and the agenda item's title or description.
2. Otherwise a near-identical title: a token overlap of at least 0.6 on the
   whole title or on its lead (the name before the first "("), at least two
   shared words, and no disagreement on dates or numbers in the lead (so one
   meeting's minutes never take another's link, while incidental numbers in a
   run-on description don't block a match).

Abbreviations the video agendas use are expanded first (CIP, CMAR, UEP, P3,
BERT). An item the minutes mark "deleted/removed from agenda" links the
agenda-approval vote that removed it ("Watch agenda approval").

**Only timestamped links are shown.** A record with no confident item match
gets no video link at all; a whole-meeting video is never offered as a
fallback. Records dated up to 3 days off their meeting may match a nearby
meeting's item.

## Items the Village didn't timestamp

The sync fills them in (`fill_untimed`) and stores where each start came from
in `timing`: `champ` (the Village's timeline, exact), `transcript`, or `gap`.
Estimated links read "about m:ss".

- **Transcript:** most videos have a WebVTT caption file
  (`play.champds.com/CAPTION/esterofl/<MediaPath>`). The chair reads each item
  aloud, so the item is found by its title words in a 30 s window, snapped to
  the first caption line that names it. An untimed item in a timed meeting is
  only searched for between its neighbours' timestamps; a sub-item only
  inside its parent's block. A meeting with no timeline is aligned in agenda
  order. One-word headings ("Consent Agenda") are only searched for between
  two placed items under 10 minutes apart.
- **Gap:** with no transcript match, an item between two timed ones starts
  where the earlier one ends. Sub-items of a timed parent inherit its start.
- The Village's own timestamps are never changed.

Held-out check (hide Village timestamps, re-estimate, compare):

| Mode | Median error | 90th pct | Off > 5 min |
|---|---|---|---|
| One untimed item, transcript | 3 s | 45 s | 1 of 60 |
| One untimed item, gap | 3 s | 51 s | 1 of 70 |
| Whole timeline missing | 4 s | 19 s | 6 of 275 |

The whole-timeline misses are mostly preview mentions ("later we'll hear the
Via Coconut project"). Only 2025-02-05 has no timeline today.

## Coverage

On the 2025–2026 gold corpus (410 records), 409 get a timestamped link and 1
gets none. That one is a source error: the 2025-11-18 PZDB
minutes call the recovery-home ordinance "2025-10", but it is 2025-14 (2025-10
is the Capital Improvements Element), so the number check rightly refuses it.

## Where it shows up

- Chat: every board-record card (`ProjectOut.video_url` / `video_label` /
  `video_start` / `video_approximate`) gets a "▶ Watch discussion (m:ss)" button.
- Board Records page: a video icon on each timestamped agenda item. Each row
  from `GET /api/records` (`records_api.py`) carries a `video` field
  (`url`, `label`, `start`, `approximate`) or `null`, from the same matcher.

## CI/CD

`.github/workflows/pipeline-refresh.yml` runs the sync on every refresh
(weekly Friday 18:00 UTC, on PDF/pipeline pushes, and on manual dispatch),
after the minutes rebuild and before the commit:

1. Discover and parse new minutes → `meetings_ai_public.csv`.
2. **Sync meeting video timestamps** → `meeting_videos/meetings.json`.
3. Commit both together and redeploy the VPS.

Records are matched to timestamps at request time, so that commit is all a
new meeting needs. The Village usually posts a meeting's video timeline days
after the meeting and weeks before its minutes, so by the time the minutes
arrive the timestamps are already synced. Each weekly run also picks up
timelines added or corrected since the last one (re-fetch on CHAMP's
`LastModifyDateTimeUTC`). A re-sync with nothing new rewrites the file
byte-for-byte, so quiet weeks commit nothing.

The step is `continue-on-error`: if CHAMP is down, the minutes refresh still
commits and the saved video file is kept. After changing the matching or
estimation code, run the workflow by hand with **force_videos** ticked to
recompute every meeting.

## Local test environment

```powershell
.\scripts\local_test_env.ps1 -SyncVideos   # API :8001 + UI :5173
.\scripts\local_test_env.ps1 -Stop
```
