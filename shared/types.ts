export type RunStatus =
  | "queued"
  | "loading"
  | "observing"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export const terminalStatuses: RunStatus[] = [
  "completed",
  "partial",
  "failed",
  "cancelled",
];
export interface Frame {
  file: string;
  elapsedMs: number;
}
export interface Clip {
  file: string;
  startSeconds: number;
  endSeconds: number;
}
export interface Fact {
  label: string;
  value: string;
  basis: "measured" | "observed" | "suggested";
}
export type ObservationKind =
  "hover" | "automatic" | "scroll" | "entry" | "container";
export interface CoverageCheck {
  id: string;
  kind: ObservationKind;
  label: string;
  selector?: string;
  status: "pending" | "checked" | "blocked" | "limited";
  outcome?: "change" | "no-change" | "uncertain";
  attempts: number;
  observedStates: string[];
  findingIds: string[];
  reason?: string;
}
export interface Behavior {
  kind: ObservationKind;
  participants: {
    selector: string;
    role: "target" | "child" | "pseudo" | "nearby";
    label: string;
    properties: string[];
    firstSeenMs: number;
  }[];
  phases: {
    name: "before" | "active" | "after";
    frame: string;
    elapsedMs: number;
    description: string;
  }[];
  restoration: "restored" | "changed" | "unknown";
  parameters: {
    name: string;
    value: string | null;
    status: "observed" | "unknown";
    source: string;
    reason?: string;
  }[];
  interpretation: { status: "inferred"; summary: string; limitation: string };
}
export interface Finding {
  id: string;
  title: string;
  category: "structure" | "motion" | "style" | "device";
  summary: string;
  trigger: string;
  changes: string;
  implementation: string;
  termIds: string[];
  evidenceStatus: "observed" | "candidate";
  facts: Fact[];
  limitations: string[];
  screenshot: string;
  frames: Frame[];
  clip?: Clip;
  selector?: string;
  behavior?: Behavior;
}
export interface ReportRun {
  version: 1;
  id: string;
  url: string;
  finalUrl?: string;
  title: string;
  sourceKind: "public" | "demo";
  status: RunStatus;
  stage: string;
  createdAt: string;
  updatedAt: string;
  findings: Finding[];
  warnings: string[];
  coverage: {
    engine: string;
    viewports: string[];
    actions: string[];
    limits: string[];
    checks?: CoverageCheck[];
  };
  media: { video?: string; preview?: string; files: string[] };
  error?: string;
}
export interface SelectionInput {
  purpose: string;
  destination: string;
  accent: string;
  pace: "quick" | "balanced" | "slow";
  content: string;
  stack: string;
  descriptionOverrides: Record<string, string>;
}
export interface DictionaryTerm {
  id: string;
  name: { zh: string; en: string };
  aliases: string[];
  plainQueries: string[];
  kind: string;
  domains: string[];
  summary: string;
  mechanism: string;
  distinctions: string[];
  relations: { type: string; termId: string }[];
  parameters: { key: string; unit: string; meaning: string }[];
  rules: { when: string; requirement: string }[];
  sources: {
    sourceId: string;
    locator?: string;
    locatorId?: string;
    usage: string;
  }[];
  editorialStatus: string;
}
