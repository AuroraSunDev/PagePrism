import type { CoverageCheck } from "../shared/types";
import type { ElementSample } from "./analyze";
import { MAX_HOVER_GROUPS } from "../shared/limits";
const values = (raw = "") =>
  raw.split(",").map((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n * (v.trim().endsWith("ms") ? 1 : 1000) : 0;
  });
export function declaredHoldMs(styles: Record<string, string>) {
  let longest = 0;
  for (const prefix of ["transition", "animation"]) {
    const duration = values(styles[prefix + "-duration"]),
      delay = values(styles[prefix + "-delay"]);
    for (let i = 0; i < Math.max(duration.length, delay.length); i++)
      longest = Math.max(
        longest,
        duration[i % duration.length] + delay[i % delay.length],
      );
  }
  return Math.min(2000, Math.max(540, Math.ceil(longest + 100)));
}
export interface ObservationAction {
  key: string;
  target: ElementSample;
  followup: boolean;
  holdMs: number;
}
type Result = {
  outcome: "change" | "no-change" | "uncertain";
  states: string[];
  findings: string[];
  blocked?: boolean;
  reason?: string;
};
export class ObservationPolicy {
  readonly checks: CoverageCheck[] = [];
  private rows = new Map<string, CoverageCheck>();
  private active = new Set<string>();
  private groups = new Set<string>();
  private followups = 0;
  constructor(
    private maxGroups = MAX_HOVER_GROUPS,
    private maxFollowups = 2,
  ) {}
  get groupsAttempted() {
    return this.groups.size;
  }
  get followupsUsed() {
    return this.followups;
  }
  private key(t: ElementSample) {
    return (t.group || t.selector) + "|" + t.styles.filter;
  }
  next(targets: ElementSample[]): ObservationAction | undefined {
    for (const t of targets) {
      const key = this.key(t);
      if (!this.rows.has(key)) {
        const row: CoverageCheck = {
          id: "check-" + this.checks.length,
          kind: "hover",
          label: t.label,
          selector: t.selector,
          status: "pending",
          attempts: 0,
          observedStates: [],
          findingIds: [],
        };
        this.rows.set(key, row);
        this.checks.push(row);
      }
    }
    const eligible = targets.filter((t) => {
      const k = this.key(t),
        r = this.rows.get(k)!;
      return (
        !this.active.has(k) &&
        r.status === "pending" &&
        (r.attempts === 0
          ? this.groups.size < this.maxGroups
          : this.followups < this.maxFollowups && r.attempts < 2)
      );
    });
    eligible.sort(
      (a, b) =>
        this.rows.get(this.key(a))!.attempts -
        this.rows.get(this.key(b))!.attempts,
    );
    const target = eligible[0];
    if (!target) return;
    const key = this.key(target),
      row = this.rows.get(key)!,
      followup = row.attempts > 0;
    if (followup) this.followups++;
    else this.groups.add(key);
    row.attempts++;
    row.selector = target.selector;
    this.active.add(key);
    return {
      key,
      target,
      followup,
      holdMs: Math.max(declaredHoldMs(target.styles), followup ? 1500 : 540),
    };
  }
  finish(action: ObservationAction, result: Result) {
    const row = this.rows.get(action.key)!;
    this.active.delete(action.key);
    row.outcome = result.outcome;
    row.observedStates = [
      ...new Set([...row.observedStates, ...result.states]),
    ];
    row.findingIds = [...new Set([...row.findingIds, ...result.findings])];
    row.reason = result.reason;
    row.status = result.blocked
      ? "blocked"
      : result.outcome === "change" ||
          row.attempts >= 2 ||
          this.followups >= this.maxFollowups
        ? "checked"
        : "pending";
  }
  record(row: Omit<CoverageCheck, "id" | "attempts">) {
    this.checks.push({
      ...row,
      id: "check-" + this.checks.length,
      attempts: 1,
    });
  }
  finalize(reason: string) {
    for (const row of this.checks)
      if (row.status === "pending") {
        row.status = "limited";
        row.reason =
          reason === "cancelled"
            ? "采集已停止，尚有状态未完成观察。"
            : "代表性观察或补查预算已结束，仍有未完成项。";
      }
  }
}
