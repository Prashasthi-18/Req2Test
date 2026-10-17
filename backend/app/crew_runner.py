"""Live runner: a sequential CrewAI crew with four agents.

CrewAI is imported lazily so demo mode works without it installed.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import yaml

from .models import CriteriaOut, FilesOut, ReviewOut, TestCasesOut

CONFIG_DIR = Path(__file__).parent / "config"
AGENT_ORDER = ["analyst", "designer", "writer", "reviewer"]
MODEL = os.getenv("LLM_MODEL", "groq/llama-3.3-70b-versatile")


class CrewUnavailable(RuntimeError):
    pass


def _fill(text: str, values: dict[str, str]) -> str:
    for key, val in values.items():
        text = text.replace(f"<<{key}>>", val)
    return text


def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    low = msg.lower()
    if "rate limit" in low or "429" in low:
        return "The model provider rate-limited this run. Wait a minute and retry, or switch to demo mode."
    if "api key" in low or "authentication" in low or "401" in low:
        return "The model provider rejected the API key. Check GROQ_API_KEY in backend/.env."
    if "validation" in low or "pydantic" in low:
        return "The model returned output that did not match the expected format. Retry the run."
    return f"The crew stopped with an error: {msg[:300]}"


def _payload(task_output: Any) -> dict[str, Any]:
    if getattr(task_output, "pydantic", None) is not None:
        return task_output.pydantic.model_dump()
    if getattr(task_output, "json_dict", None):
        return dict(task_output.json_dict)
    raise ValueError("Task returned no structured output (validation error)")


class CrewRunner:
    def run(self, run: dict[str, Any], hooks) -> dict[str, Any]:
        try:
            from crewai import LLM, Agent, Crew, Process, Task
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise CrewUnavailable(
                "CrewAI is not installed. Run `pip install -r requirements-live.txt` or set MOCK_MODE=true."
            ) from exc

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise CrewUnavailable("GROQ_API_KEY is not set. Add it to backend/.env or set MOCK_MODE=true.")

        agents_cfg = yaml.safe_load((CONFIG_DIR / "agents.yaml").read_text(encoding="utf-8"))
        tasks_cfg = yaml.safe_load((CONFIG_DIR / "tasks.yaml").read_text(encoding="utf-8"))
        opts = run["options"]
        values = {
            "story": run["story"],
            "base_url": run["base_url"],
            "types": ", ".join(opts["types"]),
            "depth": (
                "Be thorough: add boundary, state-transition and error-recovery cases where relevant."
                if opts["depth"] == "thorough"
                else "Keep the suite lean: the most valuable tests per criterion, usually 1-3."
            ),
        }

        llm = LLM(model=MODEL, api_key=api_key, temperature=0.2, max_tokens=8000)

        def mk_agent(key: str) -> Agent:
            c = agents_cfg[key]
            return Agent(
                role=c["role"], goal=c["goal"].strip(), backstory=c["backstory"].strip(),
                llm=llm, verbose=False, allow_delegation=False,
            )

        analyst, designer = mk_agent("requirements_analyst"), mk_agent("test_designer")
        writer, reviewer = mk_agent("script_writer"), mk_agent("reviewer")

        def mk_task(key: str, agent: Agent, model, context=None) -> Task:
            c = tasks_cfg[key]
            return Task(
                description=_fill(c["description"], values).strip(),
                expected_output=c["expected_output"].strip(),
                agent=agent, output_pydantic=model, context=context or [],
            )

        t1 = mk_task("analyze_requirements", analyst, CriteriaOut)
        t2 = mk_task("design_test_cases", designer, TestCasesOut, [t1])
        t3 = mk_task("write_playwright_scripts", writer, FilesOut, [t1, t2])
        t4 = mk_task("review_suite", reviewer, ReviewOut, [t1, t2, t3])

        state = {"done": 0, "outputs": {}}

        def on_task(output: Any) -> None:
            idx = state["done"]
            agent_key = AGENT_ORDER[idx]
            data = _payload(output)
            state["outputs"][agent_key] = data
            state["done"] += 1
            if agent_key == "analyst":
                crit = data["criteria"]
                hooks.completed(agent_key, data, {
                    "criteria": len(crit), "ambiguities": sum(1 for c in crit if c.get("ambiguity_note"))})
            elif agent_key == "designer":
                tcs = data["test_cases"]
                hooks.completed(agent_key, data, {
                    "test_cases": len(tcs),
                    **{k: sum(1 for t in tcs if t["type"] == k) for k in ("positive", "negative", "edge")}})
            elif agent_key == "writer":
                n_tests = sum(f["code"].count("test(") for f in data["files"])
                hooks.completed(agent_key, data, {"files": len(data["files"]), "tests": n_tests})
            if state["done"] < len(AGENT_ORDER):
                hooks.started(AGENT_ORDER[state["done"]])

        def on_step(step: Any) -> None:
            if state["done"] >= len(AGENT_ORDER):
                return
            text = getattr(step, "thought", None) or getattr(step, "text", None) or ""
            text = " ".join(str(text).split())
            if text:
                hooks.log(AGENT_ORDER[state["done"]], text[:160])

        crew = Crew(
            agents=[analyst, designer, writer, reviewer],
            tasks=[t1, t2, t3, t4],
            process=Process.sequential,
            task_callback=on_task,
            step_callback=on_step,
            verbose=False,
        )

        last_error: Exception | None = None
        for attempt in (1, 2):
            state["done"], state["outputs"] = 0, {}
            hooks.started("analyst")
            hooks.log("analyst", "Reading requirement" if attempt == 1 else "Retrying after a transient error")
            try:
                crew.kickoff()
                break
            except Exception as exc:  # noqa: BLE001 - surfaced to the user below
                last_error = exc
                if attempt == 1:
                    time.sleep(3)
        else:
            raise RuntimeError(_friendly_error(last_error or RuntimeError("unknown error")))

        reviewed = state["outputs"].get("reviewer")
        if not reviewed:
            raise RuntimeError("The reviewer did not return a result. Retry the run.")
        return {"report": reviewed["report"], "files": reviewed["files"]}
