# Req2Test Crew

Turn a user story or PRD into reviewed, runnable **Playwright (TypeScript)** tests with a four-agent CrewAI crew, inside a QA-workbench style dashboard.

```
Requirements Analyst  ->  Test Designer  ->  Script Writer  ->  Reviewer
 acceptance criteria      positive / negative    page objects +      gaps, duplicates,
 + open questions         / edge test cases      Playwright specs    weak assertions
```

## Quick start (demo mode, no API key)

Requires Python 3.11+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # MOCK_MODE=true by default
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000**. Pick a sample, press **Generate tests** (or Ctrl/Cmd+Enter).

Demo mode replays prepared outputs for the closest of three samples (login, checkout, sign-up). The pipeline, streaming, review logic, validation and exports are the real code paths; only the LLM is replaced.

## Live mode (CrewAI + Groq)

```bash
pip install -r requirements-live.txt
# in backend/.env
MOCK_MODE=false
GROQ_API_KEY=your_key        # free key: console.groq.com
```

Restart the server. The sidebar shows **Live** and the model name. Any text you paste is processed by the crew. Change the model with `LLM_MODEL` (any CrewAI/LiteLLM model string).

## Optional: Playwright discovery check

The validator always runs static checks. To also run `npx playwright test --list` on every generated project:

```bash
cd output && npm init -y && npm install @playwright/test @types/node typescript
```

## Features

Modelled on what the established tools (Qase, TestRail, mabl, TestCollab, BrowserStack Test Management) have in common:

| Feature | Where |
|---|---|
| Requirement input from pasted text, `.txt`/`.md` upload, or Jira issue | New run |
| Open questions flagged per criterion (ambiguity detection) | Requirements tab |
| Structured test cases: type, priority, steps, expected result; search and filter | Test cases tab |
| Requirement-to-test traceability matrix, uncovered requirements highlighted | Traceability tab |
| Page Object based Playwright TypeScript, syntax-highlighted, copy per file | Playwright code tab |
| Code checks: assertions present, no hard waits, TC ids in titles, resilient locators, every test implemented, optional `playwright --list` | Code tab |
| Reviewer report: coverage gaps with suggested fixes, duplicates merged, weak assertions fixed | Review tab |
| Live pipeline with activity log, per-agent metrics and timing | Run page |
| Export: Playwright project zip, Gherkin `.feature`, CSV (TestRail/Qase/Xray import), JSON | Export menu |
| Persistent run history, re-run with edits | Run history |

Keyboard: `Ctrl/Cmd+Enter` run, `/` search tests, `Esc` close panels.

## Jira import

Set in `backend/.env` (Jira Cloud, API token auth):

```
JIRA_BASE_URL=https://your-team.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=...
```

Then **New run > Import from Jira** and enter an issue key.

## Architecture

```
Browser (vanilla JS dashboard, no build step)
   |  POST /api/runs        GET /api/runs/{id}/events (SSE)      GET .../download
   v
FastAPI  --- run store (memory + output/runs/<id>/run.json)
   |
   +-- pipeline.py  orchestrates a run, then recomputes coverage, applies duplicate
   |                removals and validates, regardless of what the LLM claimed
   +-- crew_runner.py   live: sequential CrewAI crew (agents.yaml, tasks.yaml)
   +-- mock_runner.py   demo: prepared data streamed with realistic pacing
   +-- validator.py     writes the Playwright project, static checks, playwright --list
   +-- exporters.py     zip, Gherkin, CSV
```

The UI is driven only by the event stream (`run_started`, `agent_started`, `agent_log`, `agent_completed`, `validation_result`, `run_completed`, `run_failed`). Opening a past run replays its stored events through the same code, so live and historical views are identical.

## Project layout

```
backend/app/
  main.py  pipeline.py  crew_runner.py  mock_runner.py  mock_data.py
  validator.py  exporters.py  store.py  models.py
  config/agents.yaml  config/tasks.yaml
  static/index.html  styles.css  app.js
output/runs/<id>/        generated Playwright projects (git-ignored)
```

## Notes and limits

- Generated selectors and test data come from the requirement text. Adjust the page objects in `pages/` to match your real DOM before running against your app.
- `.pdf` and `.docx` upload are not supported yet; paste the text or use `.txt`/`.md`.
- Live mode quality depends on the model. Coverage, duplicate removal and validation are recomputed in code, so those numbers stay trustworthy even when the model's own summary is not.
- The Jira import and live CrewAI path need your credentials and were not exercised in the build environment.
