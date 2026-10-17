"""Demo-mode runner: streams prepared outputs with realistic pacing.

It exercises exactly the same event flow as the live CrewAI runner, so the UI
can be developed and demoed without an API key. The reviewer logic here is real
(it finds uncovered criteria, duplicate tests and tests without assertions in
the prepared data); only the LLM is replaced.
"""
from __future__ import annotations

import json
import time
from typing import Any

from .mock_data import pick_sample, render_files


class MockRunner:
    pace = 1.0  # multiply all sleeps; tests set this to 0

    def _sleep(self, seconds: float) -> None:
        time.sleep(seconds * self.pace)

    def run(self, run: dict[str, Any], hooks) -> dict[str, Any]:
        sample = pick_sample(run["story"])
        wanted = set(run["options"]["types"])
        words = len(run["story"].split())

        # 1. Requirements Analyst -------------------------------------------------
        hooks.started("analyst")
        hooks.log("analyst", f"Reading requirement ({words} words)")
        self._sleep(0.9)
        criteria = [dict(c) for c in sample["criteria"]]
        hooks.log("analyst", f"Extracted {len(criteria)} acceptance criteria")
        self._sleep(0.8)
        ambiguous = [c for c in criteria if c["ambiguity_note"]]
        hooks.log("analyst", f"Flagged {len(ambiguous)} open questions for the product owner")
        self._sleep(0.7)
        hooks.completed(
            "analyst",
            {"feature_name": sample["feature"], "criteria": criteria},
            {"criteria": len(criteria), "ambiguities": len(ambiguous)},
        )

        # 2. Test Designer --------------------------------------------------------
        hooks.started("designer")
        tests = [
            {k: v for k, v in t.items() if k not in ("actions", "weak_actions")}
            for t in sample["tests"]
            if t["type"] in wanted
        ]
        impl = {t["id"]: t for t in sample["tests"]}
        hooks.log("designer", "Designing positive, negative and boundary cases per criterion")
        self._sleep(1.0)
        for ac in criteria:
            n = sum(1 for t in tests if t["criterion_id"] == ac["id"])
            hooks.log("designer", f"{ac['id']}: {n} test case{'s' if n != 1 else ''}")
            self._sleep(0.35)
        counts = {k: sum(1 for t in tests if t["type"] == k) for k in ("positive", "negative", "edge")}
        hooks.completed("designer", {"test_cases": tests}, {"test_cases": len(tests), **counts})

        # 3. Script Writer --------------------------------------------------------
        hooks.started("writer")
        hooks.log("writer", f"Generating page object for {sample['page_path']}")
        self._sleep(0.9)
        draft_sample_tests = [impl[t["id"]] for t in tests]
        draft_files = render_files(sample, draft_sample_tests, use_weak=True)
        hooks.log("writer", f"Writing {len(tests)} Playwright tests with role/label locators")
        self._sleep(1.1)
        hooks.completed(
            "writer",
            {"files": draft_files},
            {"files": len(draft_files), "tests": len(tests)},
        )

        # 4. Reviewer -------------------------------------------------------------
        hooks.started("reviewer")
        hooks.log("reviewer", "Mapping criteria to tests")
        self._sleep(0.8)
        covered = {t["criterion_id"] for t in tests}
        gaps = []
        for ac in criteria:
            if ac["id"] not in covered:
                issue, suggestion = sample["gap_notes"].get(
                    ac["id"],
                    ("No test case covers this criterion.", "Add a positive and a negative test for it."),
                )
                gaps.append({"criterion_id": ac["id"], "issue": issue, "suggestion": suggestion})
        hooks.log("reviewer", f"{len(gaps)} criteria without a test")
        self._sleep(0.6)

        seen: dict[str, str] = {}
        duplicates = []
        for t in tests:
            sig = json.dumps([t["criterion_id"], impl[t["id"]]["actions"]])
            if sig in seen:
                duplicates.append(
                    {
                        "removed_id": t["id"],
                        "kept_id": seen[sig],
                        "reason": "Same criterion and identical steps and assertions; kept the earlier test.",
                    }
                )
            else:
                seen[sig] = t["id"]
        hooks.log("reviewer", f"{len(duplicates)} duplicate test(s) merged")
        self._sleep(0.6)

        removed = {d["removed_id"] for d in duplicates}
        final_tests = [impl[t["id"]] for t in tests if t["id"] not in removed]
        weak = [
            {
                "test_id": t["id"],
                "issue": "The test performs actions but never asserts the outcome.",
                "fix": "Added an assertion for the expected result.",
            }
            for t in final_tests
            if t.get("weak_actions")
        ]
        hooks.log("reviewer", f"{len(weak)} test(s) had no assertion; added them")
        self._sleep(0.6)
        final_files = render_files(sample, final_tests, use_weak=False)

        n_gaps, n_dup, n_weak = len(gaps), len(duplicates), len(weak)
        summary = (
            f"Merged {n_dup} duplicate test{'s' if n_dup != 1 else ''}, strengthened {n_weak} assertion"
            f"{'s' if n_weak != 1 else ''}, and found {n_gaps} requirement{'s' if n_gaps != 1 else ''} that "
            f"cannot be covered by a plain UI test without extra setup."
        )
        return {
            "report": {
                "gaps": gaps,
                "duplicates_removed": duplicates,
                "weak_assertions": weak,
                "summary": summary,
            },
            "files": final_files,
        }
