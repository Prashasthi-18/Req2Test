"""Thread-safe in-memory run store with JSON persistence on disk.

Every run keeps an ordered event log. The SSE endpoint replays that log, so a
browser can reconnect (or open a past run) and rebuild the exact same view.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = ROOT / "output" / "runs"


def _title_from(story: str) -> str:
    first = next((ln.strip() for ln in story.splitlines() if ln.strip()), "Untitled run")
    first = first.lstrip("#*- ").strip()
    return first if len(first) <= 70 else first[:67].rstrip() + "..."


class RunStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runs: dict[str, dict[str, Any]] = {}
        self._load_from_disk()

    # ----------------------------------------------------------- lifecycle
    def create(self, story: str, base_url: str, options: dict[str, Any], mode: str) -> dict[str, Any]:
        run_id = uuid.uuid4().hex[:10]
        run = {
            "id": run_id,
            "title": _title_from(story),
            "status": "queued",
            "mode": mode,
            "created_at": time.time(),
            "finished_at": None,
            "story": story,
            "base_url": base_url,
            "options": options,
            "events": [],
            "result": None,
            "error": None,
        }
        with self._lock:
            self._runs[run_id] = run
        return run

    def get(self, run_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            return self._runs.get(run_id)

    def update(self, run_id: str, **fields: Any) -> None:
        with self._lock:
            self._runs[run_id].update(fields)

    def emit(self, run_id: str, type_: str, agent: Optional[str] = None, data: Optional[dict] = None) -> None:
        with self._lock:
            run = self._runs[run_id]
            run["events"].append(
                {
                    "id": len(run["events"]),
                    "type": type_,
                    "agent": agent,
                    "timestamp": time.time(),
                    "data": data or {},
                }
            )

    def events_since(self, run_id: str, index: int) -> tuple[list[dict], str]:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return [], "missing"
            return run["events"][index:], run["status"]

    # --------------------------------------------------------- persistence
    def run_dir(self, run_id: str) -> Path:
        return RUNS_DIR / run_id

    def save(self, run_id: str) -> None:
        with self._lock:
            run = self._runs[run_id]
            d = self.run_dir(run_id)
            d.mkdir(parents=True, exist_ok=True)
            (d / "run.json").write_text(json.dumps(run, indent=2), encoding="utf-8")

    def _load_from_disk(self) -> None:
        if not RUNS_DIR.exists():
            return
        for f in RUNS_DIR.glob("*/run.json"):
            try:
                run = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            # A run that was mid-flight when the server stopped cannot resume.
            if run.get("status") in ("queued", "running"):
                run["status"] = "failed"
                run["error"] = "The server restarted while this run was in progress."
            self._runs[run["id"]] = run

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = []
            for r in self._runs.values():
                res = r.get("result") or {}
                review = res.get("review") or {}
                rows.append(
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "status": r["status"],
                        "mode": r.get("mode"),
                        "created_at": r["created_at"],
                        "finished_at": r.get("finished_at"),
                        "criteria": len(res.get("criteria", [])),
                        "test_cases": len(res.get("test_cases", [])),
                        "coverage": review.get("coverage_percent"),
                    }
                )
            return sorted(rows, key=lambda x: x["created_at"], reverse=True)

    def delete(self, run_id: str) -> bool:
        with self._lock:
            if run_id not in self._runs:
                return False
            del self._runs[run_id]
        shutil.rmtree(self.run_dir(run_id), ignore_errors=True)
        return True


store = RunStore()
