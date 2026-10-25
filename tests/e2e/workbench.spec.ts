import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
test("real demo → contextual dictionary → select → purpose → downloadable brief", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "把喜欢的网页，讲清楚。" }),
  ).toBeVisible();
  const screenshots = process.env.PAGEPRISM_SCREENSHOTS;
  const shot = async (name: string) => {
    if (!screenshots) return;
    await page.screenshot({
      path: `${screenshots}/${test.info().project.name}-${name}.png`,
    });
    if (test.info().project.name === "chromium") {
      await page.setViewportSize({ width: 1586, height: 991 });
      await page.screenshot({ path: `${screenshots}/native-${name}.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  };
  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await shot("start");
  }
  await page.getByRole("button", { name: "体验示例", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "定制并生成", exact: true }),
  ).toBeVisible({ timeout: 100000 });
  await page
    .getByRole("checkbox", { name: "选择 首屏与排版", exact: true })
    .check();
  await page
    .getByRole("button", { name: "术语：首屏主视觉区", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Hero");
  await page.getByRole("button", { name: "关闭词条", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "术语：首屏主视觉区", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: /^悬停变化：/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "交互过程", exact: true }),
  ).toBeVisible();
  await page.getByText("本次观察范围", { exact: true }).click();
  await expect(page.getByRole("list", { name: "观察检查记录" })).toBeVisible();
  await page.getByText("本次观察范围", { exact: true }).click();
  const mobileTab = page.getByRole("button", { name: "原站画面", exact: true });
  if (await mobileTab.isVisible()) await mobileTab.click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluateAll((elements) =>
          elements.every(
            (el) =>
              (el as HTMLVideoElement).readyState >= 2 &&
              !(el as HTMLVideoElement).seeking,
          ),
        ),
    )
    .toBe(true);
  if (test.info().project.name === "chromium") {
    const player = page.locator("video");
    await expect(player).toBeVisible();
    await expect
      .poll(() => player.evaluate((el) => (el as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    const start = await player.evaluate(
      (el) => (el as HTMLVideoElement).currentTime,
    );
    await player.evaluate((el) => (el as HTMLVideoElement).play());
    await expect
      .poll(() => player.evaluate((el) => (el as HTMLVideoElement).currentTime))
      .toBeGreaterThan(start);
    await player.evaluate((el) => (el as HTMLVideoElement).pause());
  }
  await shot("report");
  await page.getByRole("button", { name: /^关键帧/ }).click();
  await page.getByLabel("导出帧数").selectOption("4");
  const gridDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载拼图 PNG", exact: true }).click();
  const grid = await gridDownload;
  expect(grid.suggestedFilename()).toMatch(/frames\.png$/);
  const png = await readFile((await grid.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  await page
    .getByRole("checkbox", { name: "选择 内容网格", exact: true })
    .check();
  await page.getByRole("button", { name: "定制并生成", exact: true }).click();
  await page
    .getByLabel("你想用网站做什么？")
    .fill("展示课程项目，方便招聘者了解我的作品。");
  await expect(page.getByTestId("export-preview")).toContainText(
    "展示课程项目",
  );
  await expect(page.getByTestId("export-preview")).toContainText("内容网格");
  if (test.info().project.name === "chromium") {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "复制", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("已复制到剪贴板");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "展示课程项目",
    );
  }
  await shot("brief");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载 Markdown", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe("AGENT-BRIEF.md");
  await page.reload();
  await expect(page.getByLabel("你想用网站做什么？")).toHaveValue(
    "展示课程项目，方便招聘者了解我的作品。",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("dictionary search supports plain Chinese and keyboard dismissal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#dictionary");
  await page.getByRole("searchbox").fill("按钮被鼠标吸过去");
  await page.getByRole("button", { name: /磁吸按钮/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Magnetic Button");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("searchbox").fill("没有匹配的术语".repeat(40));
  await expect(page.getByText(/暂未收录这个词/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
