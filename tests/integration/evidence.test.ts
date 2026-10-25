import { it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluationCases } from "../../evaluation/cases";
import { captureRun } from "../../server/capture";
import { createRun } from "../../server/store";
let server: Server, base: string, temp: string;
const previous = process.env.PAGEPRISM_DATA_DIR;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "prism-evidence-"));
  process.env.PAGEPRISM_DATA_DIR = temp;
  server = createServer((req, res) => {
    const c = evaluationCases.find((c) => req.url === "/reference/" + c.id);
    res.setHeader("Content-Type", "text/html");
    res.end(c?.html || "<h1>Unknown fixture</h1>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/reference/`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(temp, { recursive: true, force: true });
  if (previous === undefined) delete process.env.PAGEPRISM_DATA_DIR;
  else process.env.PAGEPRISM_DATA_DIR = previous;
});
it.each(["declared-delay", "script-delay", "nearby-timer", "ensemble"])(
  "records evidence-guided behavior for %s",
  async (id) => {
    const r = await captureRun(createRun(base + id, "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(r.status).toBe("completed");
    const f = r.findings.find(
      (f) => f.selector === "#control" && f.trigger.includes("悬停"),
    );
    expect(f).toBeDefined();
    for (const gold of evaluationCases.find((c) => c.id === id)!.expected)
      expect(
        f!.facts.some(
          (x) =>
            x.label === gold.property &&
            (!gold.valueIncludes || x.value.includes(gold.valueIncludes)),
        ),
      ).toBe(true);
    expect(f!.behavior!.phases.map((x) => x.name)).toEqual([
      "before",
      "active",
      "after",
    ]);
    expect(
      f!.behavior!.parameters.find((x) => x.name === "reduced-motion")!.status,
    ).toBe("unknown");
    expect(
      r.coverage.checks!.find(
        (x) => x.selector === "#control" && x.kind === "hover",
      ),
    ).toMatchObject({ status: "checked", outcome: "change" });
    if (id === "script-delay")
      expect(r.coverage.checks!.some((x) => x.attempts === 2)).toBe(true);
    if (id === "ensemble")
      expect(
        new Set(f!.behavior!.participants.map((x) => x.role)).size,
      ).toBeGreaterThanOrEqual(3);
  },
  120000,
);
it("does not substitute unrelated page nodes for a missing target, and reads pseudo timing from its own style", async () => {
  const { chromium } = await import("@playwright/test"),
    { readVisualState } = await import("../../server/motion");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.setContent(
      '<style>#subject{width:200px;height:80px}#subject::after{content:"hello";transition:opacity .4s}</style><div id="subject">Visible</div>',
    );
    expect((await readVisualState(p, "#missing")).nodes).toEqual([]);
    expect(
      (await readVisualState(p, "#subject")).nodes.find(
        (n) => n.selector === "#subject::after",
      )!.timing!["transition-duration"],
    ).toBe("0.4s");
  } finally {
    await b.close();
  }
});
