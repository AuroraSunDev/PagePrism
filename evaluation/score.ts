import type { ReportRun, Finding } from "../shared/types";
import type { EvaluationCase, GoldCheck } from "./cases";
const triggerMatches = (f: Finding, kind: GoldCheck["trigger"]) =>
  kind === "hover"
    ? f.trigger.includes("悬停")
    : kind === "scroll"
      ? /滚/.test(f.trigger)
      : /自动|加载/.test(f.trigger);
export function scoreCase(c: EvaluationCase, r: ReportRun) {
  const matches = c.expected.map((g) =>
    r.findings.find(
      (f) =>
        f.selector === g.selector &&
        triggerMatches(f, g.trigger) &&
        f.facts.some(
          (p) =>
            p.label === g.property &&
            (!g.valueIncludes || p.value.includes(g.valueIncludes)),
        ),
    ),
  );
  return {
    caseId: c.id,
    status: r.status,
    expected: c.expected.length,
    matched: matches.filter(Boolean).length,
    missing: c.expected.filter((_, i) => !matches[i]),
    falseObservedHover: r.findings.filter(
      (f) =>
        c.noObservedHover?.includes(f.selector || "") &&
        f.trigger.includes("悬停") &&
        f.evidenceStatus === "observed",
    ).length,
    structured: new Set(
      matches
        .filter(
          (f) =>
            f?.behavior &&
            f.behavior.participants.length &&
            f.behavior.phases.length >= 2,
        )
        .map((f) => f!.id),
    ).size,
    remainingGaps: r.coverage.checks
      ? r.coverage.checks.filter((c) => c.status !== "checked").length
      : null,
  };
}
