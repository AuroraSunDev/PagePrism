import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureRun } from "../../server/capture";
import { collectPageEvidence } from "../../server/analyze";
import { chromium } from "@playwright/test";
import { createRun, runDirectory } from "../../server/store";

let server: Server;
let base: string;
let forbiddenRequests = 0;
let temp: string;
const previous = process.env.PAGEPRISM_DATA_DIR;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "pageprism-capture-"));
  process.env.PAGEPRISM_DATA_DIR = temp;
  server = createServer(async (req, res) => {
    if (
      req.url === "/secret" ||
      req.url?.includes("/popup/") ||
      req.method === "POST"
    ) {
      forbiddenRequests++;
      res.end("should not reach");
      return;
    }
    if (req.url === "/reference/guard/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        `<h1>Guard fixture</h1><img src="/secret"><script>fetch('/reference/write',{method:'POST'}).catch(()=>{});window.open('/reference/popup/');new WebSocket('ws://'+location.host+'/socket');</script>`,
      );
      return;
    }
    if (req.url === "/reference/redirect/") {
      res.writeHead(302, { Location: "/secret" });
      res.end();
      return;
    }
    if (req.url === "/reference/denied/") {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (req.url === "/reference/deep/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<h1>Nested reference</h1>" +
          "<div>".repeat(9) +
          '<button style="width:200px;height:50px">Deep button</button><div class="reveal" style="width:200px;height:50px;opacity:0.5">Deep reveal</div>' +
          "</div>".repeat(9),
      );
      return;
    }
    const file = req.url?.endsWith(".png") ? "architecture.png" : "index.html";
    res.setHeader(
      "Content-Type",
      file.endsWith(".png") ? "image/png" : "text/html; charset=utf-8",
    );
    res.end(await readFile(join("public/reference", file)));
  });
  server.on("upgrade", (_req, socket) => {
    forbiddenRequests++;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/reference/`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temp, { recursive: true, force: true });
  if (previous === undefined) delete process.env.PAGEPRISM_DATA_DIR;
  else process.env.PAGEPRISM_DATA_DIR = previous;
});

describe("real browser evidence", () => {
  it("records original media, real hover changes and strictly increasing sampled times", async () => {
    const result = await captureRun(createRun(base, "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(["completed", "partial"]).toContain(result.status);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.length).toBeLessThanOrEqual(12);
    const hover = result.findings.find((f) => f.trigger.includes("悬停"));
    expect(hover).toBeDefined();
    expect(hover!.facts.some((f) => f.label.includes("transform"))).toBe(true);
    expect(hover!.frames.length).toBeGreaterThanOrEqual(4);
    expect(hover!.clip!.startSeconds).toBeGreaterThanOrEqual(0);
    expect(hover!.clip!.endSeconds).toBeGreaterThan(hover!.clip!.startSeconds);
    expect(
      (hover!.clip!.endSeconds - hover!.clip!.startSeconds) * 1000,
    ).toBeGreaterThanOrEqual(hover!.frames.at(-1)!.elapsedMs);
    expect(
      hover!.frames.every(
        (f, i, all) => i === 0 || f.elapsedMs > all[i - 1].elapsedMs,
      ),
    ).toBe(true);
    expect(result.coverage.viewports).toContain("390×844");
    expect(result.media.video).toBeTruthy();
    expect(
      (await stat(join(runDirectory(result.id), result.media.video!))).size,
    ).toBeGreaterThan(1000);
    const png = await readFile(
      join(runDirectory(result.id), hover!.screenshot),
    );
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
  it("honors cancellation before launching a browser", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await captureRun(createRun(base, "demo"), {
      signal: controller.signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(result.status).toBe("cancelled");
  });
  it("returns selectors resolving to deeply nested hover and reveal targets", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(base + "deep/");
      const raw = await collectPageEvidence(page);
      expect(raw.targets.length).toBe(1);
      expect(raw.revealTargets.length).toBe(1);
      for (const target of [...raw.targets, ...raw.revealTargets])
        expect(await page.locator(target.selector).count()).toBe(1);
    } finally {
      await browser.close();
    }
  });
  it("blocks private subresources, write requests, popup navigation and sockets", async () => {
    forbiddenRequests = 0;
    const result = await captureRun(createRun(base + "guard/", "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("阻止受限网络请求"))).toBe(
      true,
    );
    expect(forbiddenRequests).toBe(0);
    expect(result.findings.some((f) => f.category === "motion")).toBe(false);
  });
  it("retains partial observations when cancelled during collection", async () => {
    const controller = new AbortController();
    const result = await captureRun(createRun(base, "demo"), {
      signal: controller.signal,
      trustedFixture: true,
      onUpdate: async (patch) => {
        if (patch.status === "observing") controller.abort();
      },
    });
    expect(result.status).toBe("cancelled");
    expect(result.findings.length).toBeGreaterThan(0);
  });
  it("blocks a redirect into a private target outside the fixed fixture", async () => {
    forbiddenRequests = 0;
    const result = await captureRun(createRun(base + "redirect/", "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(result.status).toBe("failed");
    expect(forbiddenRequests).toBe(0);
    expect(result.warnings.some((w) => w.includes("阻止受限网络请求"))).toBe(
      true,
    );
  });
  it("returns an honest HTTP error without synthetic observations", async () => {
    const result = await captureRun(createRun(base + "denied/", "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("403");
    expect(result.findings).toEqual([]);
  });
  it("stops on the configured deadline signal and reports the time limit", async () => {
    const deadline = AbortSignal.timeout(50);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline);
    try {
      const result = await captureRun(createRun(base, "demo"), {
        signal: new AbortController().signal,
        onUpdate: async () => {},
        trustedFixture: true,
      });
      expect(timeout).toHaveBeenCalledWith(120000);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("120秒");
    } finally {
      timeout.mockRestore();
    }
  });
});
