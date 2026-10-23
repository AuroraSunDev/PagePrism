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
    if (req.url?.includes("later")) {
      res.end(
        `<style>body{margin:0}header{height:1100px}#later{height:180px;font-size:64px;animation:turn 2s linear infinite;transform-origin:left}@keyframes turn{to{transform:rotate(20deg)}}</style><header><h1>Initial still screen</h1></header><h2 id="later">Later motion</h2><footer style="height:700px"></footer>`,
      );
      return;
    }
    if (req.url?.includes("canvases")) {
      res.end(
        `<h1>Multiple drawing regions</h1><canvas id="still" width="220" height="180"></canvas><canvas id="moving" width="220" height="180"></canvas><script>let t=0;const c=document.querySelector('#moving').getContext('2d');function draw(){c.clearRect(0,0,220,180);c.fillStyle='red';c.fillRect(80+Math.sin(t)*50,40,70,70);t+=.1;requestAnimationFrame(draw)}draw();</script>`,
      );
      return;
    }
    if (req.url?.includes("stale-container")) {
      res.end(
        `<h1>Changing container</h1><div id="replaceable" style="height:300px;overflow:auto"><div style="height:1000px">Scroll me</div></div><script>document.querySelector('#replaceable').onscroll=e=>e.currentTarget.remove()</script>`,
      );
      return;
    }
    if (req.url?.includes("stale-entry")) {
      res.end(
        `<h1>Still usable page</h1><div style="position:fixed;inset:0;z-index:9;background:white"><button onpointerenter="this.parentElement.remove()">Begin</button></div>`,
      );
      return;
    }
    if (req.url?.includes("timer")) {
      res.end(
        `<h1>Autonomous text</h1><button id="timer" style="width:240px;height:60px">Count 0</button><div style="position:absolute;top:160px" id="counter">Status 0</div><script>let n=0;setInterval(()=>{document.querySelector('#timer').textContent='Count '+(++n);document.querySelector('#counter').textContent='Status '+n},50)</script>`,
      );
      return;
    }

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

it.each([
  "<p>By continuing you agree to our terms</p><button>Continue</button><button>Dismiss</button>",
  '<button form="payment">Continue</button>',
  '<a role="button" href="https://example.com/">Explore</a>',
])(
  "rejects consent, associated forms and navigation as presentation entries: %s",
  async (content) => {
    const b = await chromium.launch();
    try {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await p.setContent(
        '<form id="payment"></form><div style="position:fixed;inset:0;z-index:9">' +
          content +
          "</div>",
      );
      expect((await collectPageEvidence(p)).entryTargets).toHaveLength(0);
    } finally {
      await b.close();
    }
  },
);
it.each(["later/", "canvases/", "stale-container/", "stale-entry/", "timer/"])(
  "handles general observation boundary %s",
  async (variant) => {
    const r = await captureRun(createRun(base + variant, "demo"), {
      signal: new AbortController().signal,
      onUpdate: async () => {},
      trustedFixture: true,
    });
    expect(r.status).toBe("completed");
    expect(r.coverage.viewports).toContain("390×844");
    if (variant === "later/")
      expect(
        r.findings.some(
          (f) =>
            f.selector === "#later" &&
            f.facts.some((x) => x.label === "transform"),
        ),
      ).toBe(true);
    if (variant === "canvases/") {
      expect(r.findings.some((f) => f.selector === "#moving")).toBe(true);
      expect(
        r.coverage.actions.filter((x) => x.includes("连续观察8帧")).length,
      ).toBeLessThanOrEqual(2);
    }
    if (variant.startsWith("stale"))
      expect(r.warnings.some((x) => x.includes("跳过"))).toBe(true);
    if (variant === "timer/") {
      expect(r.findings.some((f) => f.trigger.includes("自动"))).toBe(true);
      expect(
        r.findings.some(
          (f) => f.trigger.includes("悬停") && f.evidenceStatus === "observed",
        ),
      ).toBe(false);
    }
  },
  120000,
);
