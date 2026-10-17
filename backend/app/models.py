"""Pydantic schemas shared by the API layer and the CrewAI tasks.

The CrewAI tasks use these as `output_pydantic`, so the agents are forced to
return clean, typed JSON instead of free-form text.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

TestType = Literal["positive", "negative", "edge"]
Priority = Literal["P0", "P1", "P2"]


# ---------------------------------------------------------------- API input
class RunOptions(BaseModel):
    depth: Literal["standard", "thorough"] = "standard"
    types: list[TestType] = Field(default_factory=lambda: ["positive", "negative", "edge"])
    gherkin: bool = True


class RunRequest(BaseModel):
    story: str = Field(min_length=20, max_length=20000)
    base_url: str = Field(default="http://localhost:3000", max_length=300)
    options: RunOptions = Field(default_factory=RunOptions)


class JiraImportRequest(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9]+-\d+$")


# ------------------------------------------------------- agent output models
class AcceptanceCriterion(BaseModel):
    id: str = Field(description="Stable id such as AC-1")
    text: str = Field(description="One testable statement of expected behaviour")
    ambiguity_note: Optional[str] = Field(
        default=None, description="Open question if the requirement is unclear or incomplete"
    )


class CriteriaOut(BaseModel):
    feature_name: str = Field(description="Short feature name, e.g. 'Login'")
    criteria: list[AcceptanceCriterion]


class TestCase(BaseModel):
    id: str = Field(description="Stable id such as TC-001")
    criterion_id: str = Field(description="The AC id this test verifies")
    title: str
    type: TestType
    priority: Priority = "P1"
    steps: list[str]
    expected: str


class TestCasesOut(BaseModel):
    test_cases: list[TestCase]


class GeneratedFile(BaseModel):
    filename: str = Field(description="Relative path, e.g. tests/login.spec.ts or pages/LoginPage.ts")
    code: str


class FilesOut(BaseModel):
    files: list[GeneratedFile]


class Gap(BaseModel):
    criterion_id: str
    issue: str
    suggestion: str


class Duplicate(BaseModel):
    removed_id: str
    kept_id: str
    reason: str


class WeakAssertion(BaseModel):
    test_id: str
    issue: str
    fix: str


class ReviewReport(BaseModel):
    gaps: list[Gap] = Field(default_factory=list)
    duplicates_removed: list[Duplicate] = Field(default_factory=list)
    weak_assertions: list[WeakAssertion] = Field(default_factory=list)
    coverage_percent: float = 0.0
    summary: str = ""


class ReviewOut(BaseModel):
    report: ReviewReport
    files: list[GeneratedFile] = Field(description="Final, corrected files (all of them)")
