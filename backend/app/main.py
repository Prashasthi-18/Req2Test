"""Req2Test Crew API. Serves the dashboard at / and the JSON/SSE API under /api."""
from __future__ import annotations

import asyncio
import json
import os
import threading
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .crew_runner import MODEL, CrewRunner  # noqa: E402
from .exporters import build_zip, to_csv, to_gherkin  # noqa: E402
from .mock_data import public_samples  # noqa: E402
from .mock_runner import MockRunner  # noqa: E402
from .models import JiraImportRequest, RunRequest  # noqa: E402
from .pipeline import run_pipeline  # noqa: E402
from .store import store  # noqa: E402

STATIC_DIR = Path(__file__).parent / "static"
app = FastAPI(title="Req2Test Crew", version="1.0.0")


def is_demo() -> bool:
    flag = os.getenv("MOCK_MODE")
    if flag is not None:
        return flag.strip().lower() in {"1", "true", "yes", "on"}
    return not os.getenv("GROQ_API_KEY")


def jira_configured() -> bool:
    return all(os.getenv(k) for k in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"))


# -------------------------------------------------------------------- config
@app.get("/api/config")
def get_config():
    return {
        "mode": "demo" if is_demo() else "live",
        "model": None if is_demo() else MODEL.split("/")[-1],
        "jira": jira_configured(),
        "playwright_installed": (Path(__file__).resolve().parents[2] / "output" / "node_modules" / "@playwright").exists(),
    }


@app.get("/api/samples")
def get_samples():
    return public_samples()


# ---------------------------------------------------------------------- runs
@app.post("/api/runs", status_code=202)
def create_run(req: RunRequest):
    if not req.options.types:
        raise HTTPException(422, "Select at least one test type.")
    mode = "demo" if is_demo() else "live"
    run = store.create(req.story.strip(), req.base_url.strip(), req.options.model_dump(), mode)
    runner = MockRunner() if mode == "demo" else CrewRunner()
    threading.Thread(target=run_pipeline, args=(run["id"], runner), daemon=True).start()
    return {"run_id": run["id"]}


@app.get("/api/runs")
def list_runs():
    return store.list()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    run = store.get(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return {k: v for k, v in run.items() if k != "events"}


@app.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: str):
    if not store.delete(run_id):
        raise HTTPException(404, "Run not found")


@app.get("/api/runs/{run_id}/events")
async def stream_events(run_id: str, last_event_id: int | None = Query(default=None, alias="from")):
    """Server-Sent Events. Replays the full log, then follows live until the run ends."""
    if not store.get(run_id):
        raise HTTPException(404, "Run not found")

    async def gen():
        index = (last_event_id + 1) if last_event_id is not None else 0
        idle = 0
        while True:
            events, status = store.events_since(run_id, index)
            for ev in events:
                yield f"id: {ev['id']}\nevent: {ev['type']}\ndata: {json.dumps(ev)}\n\n"
                index = ev["id"] + 1
            if status in ("completed", "failed", "missing") and not events:
                break
            idle = idle + 1 if not events else 0
            if idle and idle % 100 == 0:  # keep proxies from closing an idle stream
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.15)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/runs/{run_id}/download")
def download(run_id: str, format: str = Query(default="zip", pattern="^(zip|gherkin|csv|json)$")):
    run = store.get(run_id)
    if not run or run["status"] != "completed" or not run["result"]:
        raise HTTPException(404, "Completed run not found")
    result = run["result"]
    stem = f"req2test-{run_id}"
    if format == "zip":
        data, media, name = build_zip(run, store.run_dir(run_id)), "application/zip", f"{stem}.zip"
    elif format == "gherkin":
        data = to_gherkin(result["feature_name"], result["criteria"], result["test_cases"]).encode()
        media, name = "text/plain", f"{stem}.feature"
    elif format == "csv":
        data, media, name = to_csv(result["test_cases"]).encode("utf-8-sig"), "text/csv", f"{stem}-test-cases.csv"
    else:
        data, media, name = json.dumps(result, indent=2).encode(), "application/json", f"{stem}.json"
    return Response(data, media_type=media, headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------------- jira
@app.post("/api/import/jira")
def import_jira(req: JiraImportRequest):
    """Fetch a Jira issue's summary + description (Jira Cloud REST v2)."""
    if not jira_configured():
        raise HTTPException(
            400, "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in backend/.env."
        )
    base = os.environ["JIRA_BASE_URL"].rstrip("/")
    auth = (os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"])
    try:
        r = httpx.get(f"{base}/rest/api/2/issue/{req.key.upper()}", params={"fields": "summary,description"},
                      auth=auth, timeout=15)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Could not reach Jira: {exc.__class__.__name__}") from exc
    if r.status_code == 404:
        raise HTTPException(404, f"Issue {req.key.upper()} was not found, or you do not have access.")
    if r.status_code in (401, 403):
        raise HTTPException(502, "Jira rejected the credentials. Check JIRA_EMAIL and JIRA_API_TOKEN.")
    r.raise_for_status()
    fields = r.json().get("fields", {})
    summary, desc = fields.get("summary") or "", fields.get("description") or ""
    return {"key": req.key.upper(), "story": f"{summary}\n\n{desc}".strip()}


# ----------------------------------------------------------------- frontend
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")
