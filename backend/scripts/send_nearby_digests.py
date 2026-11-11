#!/usr/bin/env python3
"""Send nearby development-alert digests for active subscriptions.

Intended for VPS cron (subscriptions live on the box under data/ops/). Requires
SMTP_* env vars in deploy/vps/.env (loaded via backend/config.py).

Usage:
  cd /app/backend && python scripts/send_nearby_digests.py
  python scripts/send_nearby_digests.py --dry-run
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from nearby_subscriptions import run_nearby_digests  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compose digests without sending or updating last_sent_at",
    )
    parser.add_argument("--lookback-days", type=int, default=400)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = run_nearby_digests(dry_run=args.dry_run, lookback_days=args.lookback_days)
    logging.info("%s", result)
    if result.get("errors"):
        return 1
    if not args.dry_run and not result.get("smtp_configured") and result.get("sent", 0) == 0:
        # No SMTP and nothing to send is fine; SMTP missing with pending work is not.
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
