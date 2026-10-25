import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { evaluationCases, type EvaluationCase } from "./cases";
import { scoreCase } from "./score";
const option = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const baseline = option("--baseline"),
  output = resolve(
    option("--out") ||
      ".pageprism/evaluation/" + new Date().toISOString().replace(/[:.]/g, "-"),
  );
const external = option("--cases");
const gold = z.object({
  selector: z.string().min(1),
  trigger: z.enum(["hover", "automatic", "scroll"]),
  property: z.string().min(1),
  valueIncludes: z.string().optional(),
});
const schema = z.array(
  z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string().min(1),
      html: z.string().optional(),
      url: z.string().url().optional(),
      expected: z.array(gold),
      noObservedHover: z.array(z.string()).optional(),
    })
    .refine((c) => !!c.html !== !!c.url, "Supply exactly one of html or url"),
);
const cases: EvaluationCase[] = external
  ? schema.parse(JSON.parse(await readFile(resolve(external), "utf8")))
  : evaluationCases;
if (new Set(cases.map((c) => c.id)).size !== cases.length)
  throw new Error("Duplicate case IDs");
await mkdir(output, { recursive: true });
const server = createServer((req, res) => {
  const c = cases.find((c) => req.url === "/reference/" + c.id);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(c?.html || "<h1>Unknown evaluation case</h1>");
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/reference/`;
const originalData = process.env.PAGEPRISM_DATA_DIR;
const sourceRevision = (directory: string) => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    try {
      return readFileSync(
        join(directory, ".evaluation-revision"),
        "utf8",
      ).trim();
    } catch {
      return "provided-snapshot";
    }
  }
};
const sources = [
  ...(baseline ? [{ name: "baseline", directory: resolve(baseline) }] : []),
  { name: "candidate", directory: process.cwd() },
];
const report = {
  scope: external
    ? "externally-supplied annotations"
    : "synthetic-authored behavior checks; not real-site recognition accuracy",
  createdAt: new Date().toISOString(),
  sources: [] as unknown[],
};
try {
  for (const source of sources) {
    const { captureRun } = (await import(
      pathToFileURL(join(source.directory, "server/capture.ts")).href
    )) as typeof import("../server/capture");
    const { createRun, saveRun } = (await import(
      pathToFileURL(join(source.directory, "server/store.ts")).href
    )) as typeof import("../server/store");
    process.env.PAGEPRISM_DATA_DIR = join(output, source.name, "runs");
    const results = [];
    for (const c of cases) {
      const r = createRun(c.url || origin + c.id, c.url ? "public" : "demo"),
        start = performance.now();
      await captureRun(r, {
        signal: new AbortController().signal,
        onUpdate: saveRun,
        trustedFixture: !c.url,
      });
      await saveRun(r);
      const score = {
        ...scoreCase(c, r),
        runId: r.id,
        seconds: Number(((performance.now() - start) / 1000).toFixed(2)),
      };
      results.push(score);
      console.log(
        source.name,
        c.id,
        score.matched + "/" + score.expected,
        score.status,
        score.seconds + "s",
      );
    }
    const total = {
      name: source.name,
      revision: sourceRevision(source.directory),
      expected: results.reduce((n, r) => n + r.expected, 0),
      matched: results.reduce((n, r) => n + r.matched, 0),
      falseObservedHover: results.reduce((n, r) => n + r.falseObservedHover, 0),
      seconds: Number(results.reduce((n, r) => n + r.seconds, 0).toFixed(2)),
      results,
    };
    report.sources.push(total);
    await writeFile(
      join(output, "comparison.json"),
      JSON.stringify(report, null, 2),
    );
  }
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  if (originalData === undefined) delete process.env.PAGEPRISM_DATA_DIR;
  else process.env.PAGEPRISM_DATA_DIR = originalData;
}
console.log("Saved", join(output, "comparison.json"));
