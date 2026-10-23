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
