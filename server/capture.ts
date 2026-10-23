import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { mkdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import type { ReportRun } from "../shared/types";
import { runDirectory } from "./store";
import { validatePublicUrl } from "./url-policy";
import { baseFindings, collectPageEvidence } from "./analyze";
import { observeMotion } from "./observe-motion";
import { CAPTURE_TIMEOUT_MS, MAX_FINDINGS } from "../shared/limits";
import { createCaptureProxy } from "./network-proxy";

type CaptureOptions = {
  signal: AbortSignal;
  onUpdate: (patch: ReportRun) => Promise<void>;
  trustedFixture?: boolean;
};

export async function captureRun(
  run: ReportRun,
  options: CaptureOptions,
): Promise<ReportRun> {
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  ]);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let proxy: Awaited<ReturnType<typeof createCaptureProxy>> | undefined;
  const directory = runDirectory(run.id);
  const blocked = new Set<string>();
  const trustedOrigin = options.trustedFixture
    ? new URL(run.url).origin
    : undefined;
  let videoStart = 0;
  const elapsedSeconds = () => (performance.now() - videoStart) / 1000;
  const update = async (status: ReportRun["status"], stage: string) => {
    run.status = status;
    run.stage = stage;
    await options.onUpdate(structuredClone(run));
  };
  const checkpoint = () => signal.throwIfAborted();
  const abortBrowser = () => {
    void context?.close().catch(() => {});
  };
  const screenshot = async (name: string): Promise<string> => {
    checkpoint();
    await page!.screenshot({
      path: join(directory, name),
      type: "png",
      timeout: 5000,
    });
    run.media.files.push(name);
    return name;
  };

  try {
    checkpoint();
    if (!trustedOrigin) await validatePublicUrl(run.url);
    await mkdir(directory, { recursive: true });
    await update("loading", "打开参考页面");
    proxy = await createCaptureProxy(trustedOrigin, (input) => {
      try {
        if (blocked.size < 20) blocked.add(new URL(input).origin);
      } catch {}
    });
    browser = await chromium.launch({
      headless: true,
      proxy: { server: proxy.url, bypass: "<-loopback>" },
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: {
        dir: join(directory, "raw"),
        size: { width: 1440, height: 900 },
      },
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    signal.addEventListener("abort", abortBrowser, { once: true });
    await context.routeWebSocket("**/*", (ws) => ws.close());
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        // A popup's first request can precede the context's page event.
        if (request.isNavigationRequest() && request.frame().page() !== page)
          throw new Error("新窗口导航已阻止");
        if (!["GET", "HEAD"].includes(request.method()))
          throw new Error("写入型请求已阻止");
        const target = new URL(request.url());
        const fixtureResource =
          trustedOrigin &&
          target.origin === trustedOrigin &&
          target.pathname.startsWith("/reference/");
        if (!fixtureResource) await validatePublicUrl(request.url());
        await route.continue();
      } catch {
        if (blocked.size < 20) {
          try {
            blocked.add(new URL(request.url()).origin);
          } catch {}
        }
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    videoStart = performance.now();
    page = await context.newPage();
    context.on("page", (popup) => {
      if (popup !== page) void popup.close();
    });
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
    });
    page.on("download", (download) => {
      void download.cancel();
    });
    page.setDefaultTimeout(6000);
    const response = await page.goto(run.url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    if (response && response.status() >= 400)
      throw new Error(`原站返回 HTTP ${response.status()}，未获得可分析页面。`);
    await page.waitForTimeout(700);
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]),
    );
    checkpoint();
    run.finalUrl = page.url();
    const raw = await collectPageEvidence(page);
    run.title =
      run.sourceKind === "demo"
        ? "Studio Reference"
        : raw.title || new URL(run.url).hostname;
    await screenshot("desktop.png");
    run.media.preview = "desktop.png";
    run.findings = baseFindings(raw);
    run.coverage.viewports.push("1440×900");
    run.coverage.actions.push("页面读取：标题、字体、底色与布局");
    await update("observing", "观察悬停与滚动");

    await observeMotion(page, run, {
      directory,
      signal,
      seconds: elapsedSeconds,
      progress: (stage) => update("observing", stage),
    });

    await update("processing", "检查移动布局并整理报告");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    await screenshot("mobile.png");
    const mobile = await collectPageEvidence(page);
    run.coverage.viewports.push("390×844");
    if (run.findings.length < MAX_FINDINGS)
      run.findings.push({
        id: "mobile-layout",
        title: "移动端布局",
        category: "device",
        summary:
          "在390px视口重新观察同一页面，保留移动端画面。请结合桌面画面对照内容重排、文字和导航。",
        trigger: "视口缩窄",
        changes: "移动端结构采样",
        implementation:
          "根据内容设置响应式断点，保持主要信息与操作可用；不能只把桌面整体缩小。",
        termIds: ["rule.input-modality", "layout.responsive"],
        evidenceStatus: "observed",
        screenshot: "mobile.png",
        frames: [],
        facts: [
          { label: "视口", value: "390×844", basis: "measured" },
          { label: "标题字号", value: mobile.headingSize, basis: "measured" },
        ],
        limitations: [
          "这是Chromium窄视口，不代表真实手机或Safari验证；未执行触摸手势。",
        ],
      });
    run.coverage.limits.push(
      "视频为桌面录制；移动端仅保留结构截图。",
      "关键帧标签为动作采样实测时间，不是视频编码时间戳。",
    );
    if (!run.findings.some((f) => f.category === "motion"))
      run.warnings.push(
        "本轮没有观察到可确认的动效变化，报告保留静态设计观察。",
      );
    checkpoint();
    run.status = "completed";
    run.stage = "拆解完成";
  } catch (error) {
    const cancelled = options.signal.aborted;
    run.status = cancelled
      ? "cancelled"
      : run.findings.length
        ? "partial"
        : "failed";
    run.stage = cancelled
      ? "已取消"
      : run.findings.length
        ? "部分完成"
        : "无法完成拆解";
    run.error =
      signal.aborted && !cancelled
        ? "采集达到120秒上限，已停止。"
        : cancelled
          ? undefined
          : error instanceof Error
            ? error.message.split("\n")[0]
            : "采集失败。";
  } finally {
    signal.removeEventListener("abort", abortBrowser);
    const video = page?.video();
    await context?.close().catch(() => {});
    if (video) {
      try {
        const source = await video.path();
        if (basename(source) !== "recording.webm")
          await rename(source, join(directory, "recording.webm"));
        run.media.video = "recording.webm";
        run.media.files.push("recording.webm");
      } catch {
        run.warnings.push("视频未能保存；可查看已采集的截图与关键帧。");
      }
    }
    await browser?.close().catch(() => {});
    await proxy?.close().catch(() => {});
    if (blocked.size)
      run.warnings.push(`已阻止受限网络请求：${[...blocked].join("、")}`);
    run.media.files = [...new Set(run.media.files)];
    await options.onUpdate(structuredClone(run));
  }
  return run;
}
