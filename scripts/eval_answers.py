"""Run backend/tests/eval_questions.json through the full RAG pipeline and
save every answer (plus rewritten query, retrieved AND used record IDs,
rerank scores, source_type, and latency) to a timestamped report — so a
prompt/retrieval change can be compared before vs. after by diffing two
reports, instead of re-reading transcripts.

This is a diagnostic/comparison tool, distinct from scripts/eval_quality.py
(pass/fail regression against backend/tests/golden_qa.json's expected
routes/IDs) — eval_questions.json carries no expectations to assert against,
just real questions to log full answers for.

Examples:
  python scripts/eval_answers.py
  python scripts/eval_answers.py --limit 5
  python scripts/eval_answers.py --label before-prompt-change
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from config import DEFAULT_CSV_PATH, EVAL_REPORTS_DIR, PROMPT_VARIANT
from store import build_store


def _load_questions(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def _run_one(case: dict[str, Any]) -> dict[str, Any]:
    from orchestrator import answer_question

    question = case["question"]
    t0 = time.perf_counter()
    try:
        result = answer_question(question)
    except Exception as exc:  # noqa: BLE001 — one bad question shouldn't kill the run
        return {
            "id": case.get("id"),
            "question": question,
            "error": str(exc),
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        }

    meta = dict(result.meta or {})
    return {
        "id": case.get("id"),
        "question": question,
        "route": result.route,
        "source_type": result.source_type,
        # rag_path.retrieve_with_crag/generate_answer stash these in meta —
        # see rag_path.py's search_query/retrieved_record_ids/rerank_scores/
        # used_record_ids keys.
        "rewritten_query": meta.get("search_query"),
        "retrieved_record_ids": meta.get("retrieved_record_ids"),
        "used_record_ids": result.used_record_ids or meta.get("used_record_ids"),
        "rerank_scores": meta.get("rerank_scores"),
        "latency_ms": meta.get("latency_ms") or round((time.perf_counter() - t0) * 1000),
        "retrieve_ms": meta.get("retrieve_ms"),
        "generate_ms": meta.get("generate_ms"),
        "used_fallback_answer": meta.get("used_fallback_answer"),
        "llm_model": meta.get("llm_model"),
        "answer_markdown": result.answer or result.summary,
        "timeline": [t.model_dump() for t in result.timeline],
        "related": [r.model_dump() for r in result.related],
        "follow_ups": result.follow_ups,
        "card_count": len(result.projects),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Max questions (0 = all)")
    parser.add_argument(
        "--questions",
        type=Path,
        default=ROOT / "backend" / "tests" / "eval_questions.json",
    )
    parser.add_argument("--label", type=str, default="", help="Freeform tag stored in the report (e.g. 'before')")
    args = parser.parse_args()

    if not Path(DEFAULT_CSV_PATH).exists():
        print(f"CSV missing: {DEFAULT_CSV_PATH}")
        return 1

    cases = _load_questions(args.questions)
    if args.limit > 0:
        cases = cases[: args.limit]

    build_store(DEFAULT_CSV_PATH)
    rows = [_run_one(case) for case in cases]

    n = len(rows)
    n_errors = sum(1 for r in rows if r.get("error"))
    n_fallback = sum(1 for r in rows if r.get("used_fallback_answer"))
    latencies = [r["latency_ms"] for r in rows if isinstance(r.get("latency_ms"), (int, float))]
    mean_latency = sum(latencies) / len(latencies) if latencies else 0

    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "label": args.label,
        "prompt_variant": PROMPT_VARIANT,
        "summary": {
            "questions": n,
            "errors": n_errors,
            "fallback_answers": n_fallback,
            "mean_latency_ms": round(mean_latency, 1),
        },
        "answers": rows,
    }

    out_dir = Path(EVAL_REPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = f"_{args.label}" if args.label else ""
    out_path = out_dir / f"answers_{stamp}{suffix}.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report["summary"], indent=2))
    print(f"Wrote {out_path}")
    return 0 if n_errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
