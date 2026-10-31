# Handoff — cloud agent → Nolan/Ethan (2026-10-31)

## Done

- Root cause: Village mid-2026 minutes moved off `library-ada/minutes/` to
  `/wp-content/uploads/YYYY/MM/…`, so `pipeline/discover.py` stopped seeing
  council minutes after **2026-06-17** (Jul 2, Sep 9, Sep 23 were live but
  invisible). Bronze URL list also blocked re-download of missing Jan–Jun 2026
  PDFs that never landed in `pdfs/`.
- Fix in `pipeline/discover.py` + tests: widen PDF href matcher, re-fetch when
  URL is listed but PDF missing, repair filename year typos via path year,
  skip dates already on disk per body.

## Next / verify

1. Merge PR → `pipeline-refresh.yml` should download ~14 2026 council/PZDB PDFs
   (plus historical 2018 gaps) and rebuild gold.
2. Confirm gold latest Village Council date moves past 2026-06-17 to at least
   2026-09-23 (Village has not posted Oct 2026 council minutes yet).
3. `python -m pytest pipeline/tests/test_discover.py -q`

## Note

`engage-estero-sync` MCP was unavailable in this cloud environment; handoff
written to git directly.
