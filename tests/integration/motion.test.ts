import { afterAll, beforeAll, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { collectPageEvidence } from "../../server/analyze";
import { captureRun } from "../../server/capture";
import { createRun } from "../../server/store";
let server: Server, base: string, temp: string;
const previous = process.env.PAGEPRISM_DATA_DIR;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "prism-general-"));
  process.env.PAGEPRISM_DATA_DIR = temp;
  const html = await readFile("tests/fixtures/motion.html", "utf8");
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      req.url?.includes("variant")
        ? html
            .replaceAll("person", "tile")
            .replaceAll("experience", "gallery")
            .replaceAll("entry", "welcome")
            .replaceAll("Begin", "Let's go")
            .replace(
              /<div(\s+class="tile"[^>]*)>([\s\S]*?)<\/div>/g,
              "<figure$1>$2</figure>",
            )
            .replace(
              "</html>",
              `<script>const delayed=document.querySelector('#drawing');delayed.style.visibility='hidden';document.querySelector('#enter').addEventListener('click',()=>setTimeout(()=>delayed.style.visibility='visible',8000));</script></html>`,
            )
        : html,
    );
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
it.each(["", "variant/"])(
  "discovers component state and a presentation entrance without site-specific names: %s",
  async (variant) => {
    const b = await chromium.launch();
    try {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.goto(base + variant);
      const initial = await collectPageEvidence(p);
      expect(initial.entryTargets).toHaveLength(1);
      expect(initial.entryTargets[0].label).not.toContain("Enter experience");
      await p.locator(initial.entryTargets[0].selector).evaluate((el) => {
        el.setAttribute("aria-label", "Agree to terms");
        el.textContent = "→";
      });
      expect((await collectPageEvidence(p)).entryTargets).toHaveLength(0);
      await p.locator(initial.entryTargets[0].selector).evaluate((el) => {
        el.removeAttribute("aria-label");
        el.textContent = "Continue";
      });
      await p.locator(initial.entryTargets[0].selector).click();
      await p
        .locator('[tabindex="0"]')
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect(),
            cover = document.createElement("div");
          Object.assign(cover.style, {
            position: "fixed",
            left: r.x + "px",
            top: r.y + "px",
            width: r.width + "px",
            height: r.height + "px",
            zIndex: "999",
            background: "white",
          });
          document.body.append(cover);
        });
      const raw = await collectPageEvidence(p);
      const target = raw.targets.find(
        (t) => t.styles.filter === "grayscale(1)",
      );
      expect(target).toBeDefined();
      expect(await p.locator(target!.selector).getAttribute("data-said")).toBe(
        "Another sample story",
      );
      // A preceding sibling does not invalidate the saved component locator.
      await p
        .locator("body")
        .evaluate((el) =>
          el.insertBefore(document.createElement("main"), el.firstChild),
        );
      expect(await p.locator(target!.selector).count()).toBe(1);
      expect(raw.scrollContainers.length).toBeGreaterThan(0);
    } finally {
      await b.close();
    }
  },
);
it.each(["", "variant/"])(
  "records changes across unknown component names, entrance and containers: %s",
  async (variant) => {
    const r = await captureRun(createRun(base + variant, "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(r.status).toBe("completed");
    expect(r.coverage.actions.some((x) => x.includes("入口"))).toBe(true);
    expect(
      r.findings.some(
        (f) =>
          f.facts.some((x) => x.label === "filter") &&
          f.facts.some((x) => x.value.includes("A sample story")),
      ),
    ).toBe(true);
    expect(r.findings.some((f) => f.trigger.includes("自动"))).toBe(true);
    expect(
      r.findings.some(
        (f) => f.selector === "#drawing" && f.evidenceStatus === "candidate",
      ),
    ).toBe(true);
    expect(r.coverage.actions.some((x) => x.includes("容器"))).toBe(true);
    expect(
      r.findings.every((f) =>
        f.frames.every(
          (x, i, a) => i === 0 || x.elapsedMs > a[i - 1].elapsedMs,
        ),
      ),
    ).toBe(true);
  },
  120000,
);
it("does not label a still canvas as animated", async () => {
  const r = await captureRun(createRun(base + "static/", "demo"), {
    signal: new AbortController().signal,
    onUpdate: async () => {},
    trustedFixture: true,
  });
  expect(r.status).toBe("completed");
  expect(r.findings.some((f) => f.selector === "#drawing")).toBe(false);
}, 120000);
