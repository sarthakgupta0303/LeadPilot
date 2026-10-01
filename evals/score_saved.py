"""Score replies that were collected outside run_evals.py (e.g. from a browser) and write the usual reports.

Input: a JSON list of {"id", "reply", "sources", "ms"} objects, one per golden-set case.

Usage:
  python3 evals/score_saved.py replies.json --label run-1-baseline
"""
import argparse
import json
import pathlib
import types

import run_evals as R

HERE = pathlib.Path(__file__).parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("replies")
    ap.add_argument("--label", default="")
    ap.add_argument("--fallback", default=R.DEFAULT_FALLBACK)
    args = ap.parse_args()

    cases = {c["id"]: c for c in json.loads((HERE / "golden_set.json").read_text())["cases"]}
    rows = []
    for r in json.loads(pathlib.Path(args.replies).read_text()):
        c = cases[r["id"]]
        turns = c.get("turns") or [c["message"]]
        if r.get("error"):
            passed, reason = False, "error: " + r["error"]
        else:
            passed, reason = R.score(c, r["reply"], r.get("sources") or [], args.fallback)
        rows.append({
            "id": c["id"], "category": c["category"], "expect": c["expect"],
            "question": " → ".join(turns), "passed": passed, "reason": reason,
            "latency_s": round(r.get("ms", 0) / 1000, 2), "sources": "; ".join(r.get("sources") or []),
            "reply": r["reply"], "human_review": r.get("human_review", ""),
        })
    R.write_reports(rows, types.SimpleNamespace(endpoint=R.DEFAULT_ENDPOINT + (f" ({args.label})" if args.label else "")))


if __name__ == "__main__":
    main()
