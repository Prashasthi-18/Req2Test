"""Orchestrates a run: runner (demo or live crew) -> deterministic finalize -> validate -> persist.

Whatever the LLM claims, the numbers shown to the user (coverage, duplicates
removed, validation) are recomputed here from the actual data.
"""
from __future__ import annotations

import time
import traceback
from typing import Any

from .store import store
from .validator import validate


class Hooks:
    """Callbacks a runner uses to report progress. Also captures each agent's output."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.outputs: dict[str, dict[str, Any]] = {}
        self._t0: dict[str, float] = {}

    def started(self, agent: str) -> None:
        self._t0[agent] = time.time()
        store.emit(self.run_id, "agent_started", agent)

    def log(self, agent: str, message: str) -> None:
        store.emit(self.run_id, "agent_log", agent, {"message": message})

    def completed(self, agent: str, output: dict[str, Any], summary: dict[str, Any]) -> None:
        self.outputs[agent] = output
        duration = round(time.time() - self._t0.get(agent, time.time()), 1)
        store.emit(self.run_id, "agent_completed", agent,
                   {"output": output, "summary": summary, "duration": duration})


def finalize(criteria: list[dict], tests: list[dict], report: dict[str, Any]) -> tuple[list[dict], dict[str, Any]]:
    """Apply the reviewer's duplicate removals and recompute coverage from the real data."""
    removed = {d["removed_id"] for d in report.get("duplicates_removed", [])}
    final_tests = [t for t in tests if t["id"] not in removed]

    ids = [c["id"] for c in criteria]
    covered = {t["criterion_id"] for t in final_tests}
    report["coverage_percent"] = round(100 * len([i for i in ids if i in covered]) / len(ids), 1) if ids else 0.0

    reported = {g["criterion_id"] for g in report.get("gaps", [])}
    for cid in ids:
        if cid not in covered and cid not in reported:
            report.setdefault("gaps", []).append({
                "criterion_id": cid,
                "issue": "No test case covers this criterion.",
                "suggestion": "Add at least one positive and one negative test for it.",
            })
    return final_tests, report


def run_pipeline(run_id: str, runner) -> None:
    run = store.get(run_id)
    assert run is not None
    hooks = Hooks(run_id)
    store.update(run_id, status="running")
    store.emit(run_id, "run_started", None, {"mode": run["mode"]})
    try:
        raw = runner.run(run, hooks)
        criteria_out = hooks.outputs["analyst"]
        criteria = criteria_out["criteria"]
        tests = hooks.outputs["designer"]["test_cases"]

        final_tests, report = finalize(criteria, tests, raw["report"])
        files = raw["files"]
        hooks.completed("reviewer", {"report": report, "test_cases": final_tests, "files": files}, {
            "coverage": report["coverage_percent"],
            "gaps": len(report["gaps"]),
            "duplicates": len(report["duplicates_removed"]),
            "weak": len(report["weak_assertions"]),
        })

        validation = validate(store.run_dir(run_id), run["base_url"], files, final_tests)
        store.emit(run_id, "validation_result", None, validation)

        result = {
            "feature_name": criteria_out.get("feature_name", "Feature"),
            "criteria": criteria,
            "test_cases": final_tests,
            "files": files,
            "review": report,
            "validation": validation,
        }
        store.update(run_id, status="completed", result=result, finished_at=time.time())
        store.emit(run_id, "run_completed", None, {"coverage": report["coverage_percent"]})
    except Exception as exc:  # noqa: BLE001 - reported to the client
        traceback.print_exc()
        message = str(exc) or exc.__class__.__name__
        store.update(run_id, status="failed", error=message, finished_at=time.time())
        store.emit(run_id, "run_failed", None, {"message": message})
    finally:
        store.save(run_id)
