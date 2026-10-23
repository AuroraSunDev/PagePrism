import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { ReportRun } from "../shared/types";
import { terminalStatuses } from "../shared/types";

export const safeRunId = (value: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export const safeMediaName = (value: string) =>
  /^[a-z0-9][a-z0-9_-]*\.(png|webm)$/.test(value);
export const dataDirectory = () =>
  resolve(process.env.PAGEPRISM_DATA_DIR || ".pageprism/runs");
export function runDirectory(id: string) {
  if (!safeRunId(id)) throw new Error("无效的任务 ID。");
  return join(dataDirectory(), id);
}
export async function saveRun(run: ReportRun) {
  const dir = runDirectory(run.id);
  await mkdir(dir, { recursive: true });
  run.updatedAt = new Date().toISOString();
  const temp = join(dir, `run-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(run, null, 2));
  await rename(temp, join(dir, "run.json"));
}
export async function readRun(id: string): Promise<ReportRun | null> {
  if (!safeRunId(id)) return null;
  try {
    return JSON.parse(
      await readFile(join(runDirectory(id), "run.json"), "utf8"),
    );
  } catch {
    return null;
  }
}
export async function listRuns(): Promise<ReportRun[]> {
  await mkdir(dataDirectory(), { recursive: true });
  const names = (await readdir(dataDirectory())).filter(safeRunId);
  const results = await Promise.all(names.map(readRun));
  return results
    .filter((run): run is ReportRun => !!run)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function recoverInterruptedRuns() {
  for (const run of await listRuns()) {
    if (!terminalStatuses.includes(run.status)) {
      run.status = run.findings.length ? "partial" : "failed";
      run.stage = "上次任务已中断";
      run.warnings.push("服务在采集结束前停止；保留了已完成的观察。");
      await saveRun(run);
    }
  }
}
export function createRun(
  url: string,
  sourceKind: ReportRun["sourceKind"],
): ReportRun {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: randomUUID(),
    url,
    title: sourceKind === "demo" ? "Studio Reference" : new URL(url).hostname,
    sourceKind,
    status: "queued",
    stage: "准备开始",
    createdAt: now,
    updatedAt: now,
    findings: [],
    warnings: [],
    media: { files: [] },
    coverage: {
      engine: "Chromium",
      viewports: [],
      actions: [],
      limits: [
        "公开单页，最多6个代表条目",
        "未执行点击、提交、登录及跨页浏览",
        "Canvas／3D内部逻辑与原站动画库未验证",
      ],
    },
  };
}
