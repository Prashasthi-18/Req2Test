"""Req2Test Crew, Streamlit front end. Runs the same pipeline as the FastAPI app in backend/app."""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path

import streamlit as st

BACKEND = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND))

# Streamlit Cloud secrets -> env vars, before the backend reads them at import time.
try:
    for key in ("MOCK_MODE", "GROQ_API_KEY", "LLM_MODEL"):
        if key in st.secrets and key not in os.environ:
            os.environ[key] = str(st.secrets[key])
except FileNotFoundError:  # no secrets.toml locally
    pass

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from app.crew_runner import AGENT_ORDER, CrewRunner  # noqa: E402
from app.exporters import build_zip, to_csv, to_gherkin  # noqa: E402
from app.mock_data import public_samples  # noqa: E402
from app.mock_runner import MockRunner  # noqa: E402
from app.pipeline import run_pipeline  # noqa: E402
from app.store import store  # noqa: E402

AGENT_LABELS = {
    "analyst": "Requirements Analyst",
    "designer": "Test Designer",
    "writer": "Automation Engineer",
    "reviewer": "QA Reviewer",
}


def is_demo() -> bool:
    flag = os.getenv("MOCK_MODE")
    if flag is not None:
        return flag.strip().lower() in {"1", "true", "yes", "on"}
    return not os.getenv("GROQ_API_KEY")


def start_run(story: str, base_url: str, options: dict) -> str:
    mode = "demo" if is_demo() else "live"
    run = store.create(story.strip(), base_url.strip(), options, mode)
    runner = MockRunner() if mode == "demo" else CrewRunner()
    threading.Thread(target=run_pipeline, args=(run["id"], runner), daemon=True).start()
    return run["id"]


def agent_states(events: list[dict]) -> dict[str, dict]:
    states = {a: {"status": "waiting", "logs": [], "summary": None, "duration": None} for a in AGENT_ORDER}
    for ev in events:
        agent = ev.get("agent")
        if agent not in states:
            continue
        if ev["type"] == "agent_started":
            states[agent]["status"] = "running"
        elif ev["type"] == "agent_log":
            states[agent]["logs"].append(ev["data"].get("message", ""))
        elif ev["type"] == "agent_completed":
            states[agent].update(status="done", summary=ev["data"].get("summary"),
                                 duration=ev["data"].get("duration"))
    return states


def render_progress(run: dict) -> None:
    states = agent_states(run["events"])
    cols = st.columns(len(AGENT_ORDER))
    for col, agent in zip(cols, AGENT_ORDER):
        s = states[agent]
        with col:
            icon = {"waiting": "⏳", "running": "🔄", "done": "✅"}[s["status"]]
            st.markdown(f"**{icon} {AGENT_LABELS[agent]}**")
            if s["duration"] is not None:
                st.caption(f"{s['duration']}s")
            for line in s["logs"][-4:]:
                st.caption(line)


def render_result(run_id: str, run: dict) -> None:
    result = run["result"]
    review = result["review"]
    validation = result["validation"]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Acceptance criteria", len(result["criteria"]))
    c2.metric("Test cases", len(result["test_cases"]))
    c3.metric("Coverage", f"{review['coverage_percent']}%")
    c4.metric("Duplicates removed", len(review.get("duplicates_removed", [])))

    tabs = st.tabs(["Criteria", "Test cases", "Code", "Review", "Validation", "Download"])

    with tabs[0]:
        for c in result["criteria"]:
            st.markdown(f"**{c['id']}**: {c['text']}")
            if c.get("ambiguity_note"):
                st.warning(c["ambiguity_note"], icon="❓")

    with tabs[1]:
        st.dataframe(
            [{"ID": t["id"], "AC": t["criterion_id"], "Title": t["title"], "Type": t["type"],
              "Priority": t["priority"], "Expected": t["expected"]} for t in result["test_cases"]],
            width="stretch", hide_index=True,
        )
        for t in result["test_cases"]:
            with st.expander(f"{t['id']}: {t['title']}"):
                st.markdown("\n".join(f"{i}. {s}" for i, s in enumerate(t["steps"], 1)))
                st.markdown(f"**Expected:** {t['expected']}")

    with tabs[2]:
        for f in result["files"]:
            st.markdown(f"`{f['filename']}`")
            st.code(f["code"], language="typescript")

    with tabs[3]:
        if review.get("summary"):
            st.write(review["summary"])
        for title, key, fmt in (
            ("Gaps", "gaps", lambda g: f"**{g['criterion_id']}**: {g['issue']} *{g['suggestion']}*"),
            ("Duplicates removed", "duplicates_removed",
             lambda d: f"**{d['removed_id']}** (kept {d['kept_id']}): {d['reason']}"),
            ("Weak assertions", "weak_assertions", lambda w: f"**{w['test_id']}**: {w['issue']} *{w['fix']}*"),
        ):
            st.subheader(title)
            items = review.get(key, [])
            if not items:
                st.caption("None")
            for item in items:
                st.markdown(f"- {fmt(item)}")

    with tabs[4]:
        for check in validation["static_checks"]:
            mark = "✅" if check["passed"] else "❌"
            st.markdown(f"{mark} **{check['name']}**: {check.get('detail', '')}")
        pw = validation["playwright"]
        st.caption(f"Playwright discovery: {pw['status']}")
        if pw.get("output"):
            with st.expander("Playwright output"):
                st.code(pw["output"])

    with tabs[5]:
        stem = f"req2test-{run_id}"
        st.download_button("Playwright project (.zip)", build_zip(run, store.run_dir(run_id)),
                           f"{stem}.zip", "application/zip")
        st.download_button("Gherkin (.feature)",
                           to_gherkin(result["feature_name"], result["criteria"], result["test_cases"]),
                           f"{stem}.feature", "text/plain")
        st.download_button("Test cases (.csv)", to_csv(result["test_cases"]).encode("utf-8-sig"),
                           f"{stem}-test-cases.csv", "text/csv")
        st.download_button("Everything (.json)", json.dumps(result, indent=2),
                           f"{stem}.json", "application/json")


# ----------------------------------------------------------------------- page
st.set_page_config(page_title="Req2Test Crew", page_icon="🧪", layout="wide")
st.title("Req2Test Crew")
st.caption("Paste a requirement. Get reviewed, runnable Playwright tests.")
st.info("Demo mode: prepared outputs, no API key needed." if is_demo()
        else f"Live mode: {os.getenv('LLM_MODEL', 'groq/llama-3.3-70b-versatile')}")

samples = public_samples()
st.session_state.setdefault("story", "")
st.session_state.setdefault("base_url", "http://localhost:3000")
with st.sidebar:
    st.header("Samples")
    for s in samples:
        if st.button(s["title"], key=f"sample-{s['id']}", width="stretch"):
            st.session_state.story = s["story"]
            st.session_state.base_url = s["base_url"]
        st.caption(s["blurb"])

story = st.text_area("User story / requirement", key="story", height=220,
                     placeholder="As a user, I want to ...")
col_url, col_depth = st.columns([3, 1])
base_url = col_url.text_input("Base URL of the app under test", key="base_url")
depth = col_depth.selectbox("Depth", ["standard", "thorough"])
types = st.multiselect("Test types", ["positive", "negative", "edge"], default=["positive", "negative", "edge"])

if st.button("Generate tests", type="primary"):
    if len(story.strip()) < 20:
        st.error("The requirement must be at least 20 characters.")
    elif not types:
        st.error("Select at least one test type.")
    else:
        st.session_state.run_id = start_run(story, base_url, {"depth": depth, "types": types, "gherkin": True})

run_id = st.session_state.get("run_id")
if run_id:
    run = store.get(run_id)
    st.divider()
    render_progress(run)
    if run["status"] in ("queued", "running"):
        time.sleep(0.5)
        st.rerun()
    elif run["status"] == "failed":
        st.error(run["error"])
    else:
        st.success(f"Done: {run['result']['feature_name']}")
        render_result(run_id, run)
