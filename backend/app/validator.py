"""Writes the generated Playwright project to disk and validates it.

Two layers of validation:
1. Static checks (always run, no dependencies): every test has an assertion,
   no hard waits, every test title carries its TC id, every test case made it
   into code, and locators avoid brittle CSS/XPath.
2. `npx playwright test --list` (runs only if @playwright/test is installed in
   /output): proves the files parse and tests are discoverable.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .store import ROOT

PLAYWRIGHT_VERSION = "^1.49.0"


class UnsafePathError(ValueError):
    pass


def _safe_relative(filename: str) -> Path:
    p = Path(filename.replace("\\", "/"))
    if p.is_absolute() or ".." in p.parts or not p.parts or p.suffix not in {".ts", ".js"}:
        raise UnsafePathError(f"Unsafe or unsupported file name from the model: {filename!r}")
    return p


def scaffold_files(base_url: str) -> dict[str, str]:
    """Minimal Playwright project around the generated tests."""
    safe_url = base_url.replace("'", "")
    return {
        "package.json": json.dumps(
            {
                "name": "generated-playwright-tests",
                "private": True,
                "scripts": {"test": "playwright test", "list": "playwright test --list"},
                "devDependencies": {"@playwright/test": PLAYWRIGHT_VERSION, "@types/node": "^22.0.0", "typescript": "^5.6.0"},
            },
            indent=2,
        )
        + "\n",
        "playwright.config.ts": (
            "import { defineConfig, devices } from '@playwright/test';\n\n"
            "export default defineConfig({\n"
            "  testDir: './tests',\n"
            "  fullyParallel: true,\n"
            "  retries: process.env.CI ? 2 : 0,\n"
            "  reporter: [['list'], ['html', { open: 'never' }]],\n"
            "  use: {\n"
            f"    baseURL: process.env.BASE_URL ?? '{safe_url}',\n"
            "    trace: 'on-first-retry',\n"
            "  },\n"
            "  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],\n"
            "});\n"
        ),
        "tsconfig.json": json.dumps(
            {
                "compilerOptions": {
                    "target": "ES2022",
                    "module": "commonjs",
                    "moduleResolution": "node",
                    "strict": True,
                    "esModuleInterop": True,
                    "skipLibCheck": True,
                    "noEmit": True,
                },
                "include": ["tests", "pages", "playwright.config.ts"],
            },
            indent=2,
        )
        + "\n",
    }


def write_project(run_dir: Path, base_url: str, files: list[dict[str, str]]) -> list[str]:
    """(Re)write generated files plus scaffolding. Returns the written paths."""
    run_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("tests", "pages"):
        shutil.rmtree(run_dir / sub, ignore_errors=True)
    written: list[str] = []
    for name, content in scaffold_files(base_url).items():
        (run_dir / name).write_text(content, encoding="utf-8")
        written.append(name)
    for f in files:
        rel = _safe_relative(f["filename"])
        target = run_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f["code"], encoding="utf-8")
        written.append(rel.as_posix())
    return written


# ----------------------------------------------------------- static checks
_TEST_START = re.compile(r"^\s*test(?:\.only)?\(\s*(['\"`])(.*?)\1", re.M)


def _split_tests(code: str) -> list[tuple[str, str]]:
    """Return (title, body) for each `test(...)` block in a spec file."""
    matches = list(_TEST_START.finditer(code))
    out = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(code)
        out.append((m.group(2), code[m.start():end]))
    return out


def static_checks(files: list[dict[str, str]], test_cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spec_files = [f for f in files if f["filename"].endswith((".spec.ts", ".spec.js"))]
    blocks = [b for f in spec_files for b in _split_tests(f["code"])]
    all_code = "\n".join(f["code"] for f in files)

    no_expect = [t for t, body in blocks if "expect(" not in body]
    no_id = [t for t, _ in blocks if not re.search(r"\bTC-\d+", t)]
    hard_waits = [t for t, body in blocks if re.search(r"waitForTimeout|setTimeout|sleep\(", body)]
    brittle = len(re.findall(r"\.locator\(\s*['\"`](?:\/\/|xpath=|css=|[.#\[])", all_code))
    missing = [tc["id"] for tc in test_cases if tc["id"] not in all_code]

    def check(name: str, ok: bool, ok_msg: str, fail_msg: str) -> dict[str, Any]:
        return {"name": name, "passed": ok, "detail": ok_msg if ok else fail_msg}

    return [
        check("Every test has an assertion", bool(blocks) and not no_expect,
              f"{len(blocks)} tests, all contain expect()",
              f"{len(no_expect)} test(s) without expect()" if blocks else "No tests found in generated files"),
        check("Test titles carry a TC id", bool(blocks) and not no_id,
              "All titles are traceable to a test case", f"{len(no_id)} title(s) missing a TC id"),
        check("No hard-coded waits", not hard_waits,
              "No waitForTimeout / sleep calls", f"Hard wait in: {', '.join(hard_waits[:3])}"),
        check("Every test case is implemented", not missing,
              f"{len(test_cases)} of {len(test_cases)} test cases found in code",
              f"Missing in code: {', '.join(missing[:6])}"),
        check("Resilient locators", brittle == 0,
              "Uses role, label and test-id locators", f"{brittle} CSS/XPath locator(s) found"),
    ]


# -------------------------------------------------------- playwright --list
def _find_playwright(run_dir: Path) -> bool:
    for parent in [run_dir, *run_dir.parents]:
        if (parent / "node_modules" / "@playwright" / "test").exists():
            return True
        if parent == ROOT:
            break
    return False


def playwright_list(run_dir: Path) -> dict[str, Any]:
    npx = shutil.which("npx")
    if not npx:
        return {"status": "skipped", "output": "Node.js (npx) was not found on PATH.", "total": None}
    if not _find_playwright(run_dir):
        return {
            "status": "skipped",
            "output": "Playwright is not installed yet. Run `npm install` inside the output/ folder "
                      "to enable this check.",
            "total": None,
        }
    try:
        proc = subprocess.run(
            [npx, "--no-install", "playwright", "test", "--list"],
            cwd=run_dir, capture_output=True, text=True, timeout=90,
        )
    except subprocess.TimeoutExpired:
        return {"status": "failed", "output": "playwright test --list timed out after 90s.", "total": None}
    out = (proc.stdout + proc.stderr).strip()
    m = re.search(r"Total:\s*(\d+)\s*test", out)
    return {
        "status": "passed" if proc.returncode == 0 else "failed",
        "output": out[-4000:],
        "total": int(m.group(1)) if m else None,
    }


def validate(run_dir: Path, base_url: str, files: list[dict[str, str]], test_cases: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        write_project(run_dir, base_url, files)
    except UnsafePathError as exc:
        return {
            "static_checks": [{"name": "Safe file names", "passed": False, "detail": str(exc)}],
            "playwright": {"status": "failed", "output": str(exc), "total": None},
        }
    return {"static_checks": static_checks(files, test_cases), "playwright": playwright_list(run_dir)}
