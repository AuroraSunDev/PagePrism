import { it, expect } from "vitest";
import { scoreCase } from "../../evaluation/score";
import { evaluationCases } from "../../evaluation/cases";
import { createRun } from "../../server/store";
it("scores observed properties independently of generated titles and keeps negatives separate", () => {
  const c = evaluationCases.find((x) => x.id === "declared-delay")!,
    r = createRun("https://example.com", "public");
  r.status = "completed";
  r.findings = [
    {
      id: "f",
      title: "任意名称",
      category: "motion",
      summary: "",
      trigger: "鼠标悬停",
      changes: "",
      implementation: "",
      termIds: [],
      evidenceStatus: "observed",
      facts: [
        { label: "filter", value: "grayscale(1) → none", basis: "measured" },
      ],
      limitations: [],
      screenshot: "f.png",
      frames: [],
      selector: "#control",
    },
  ];
  expect(scoreCase(c, r)).toMatchObject({
    matched: 1,
    expected: 1,
    falseObservedHover: 0,
    structured: 0,
  });
  r.findings[0].facts = [];
  expect(scoreCase(c, r).matched).toBe(0);
});
it("does not turn absent old-format coverage metadata into a zero-gap claim", () => {
  const r = createRun("https://example.com", "public");
  r.status = "completed";
  expect(scoreCase(evaluationCases[6], r).remainingGaps).toBeNull();
});
