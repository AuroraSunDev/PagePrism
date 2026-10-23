import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Finding, Frame, ReportRun } from '../shared/types';
import { runDirectory } from './store';
import { validatePublicUrl } from './url-policy';
import { baseFindings, collectPageEvidence, sampleElement } from './analyze';

type CaptureOptions = { signal: AbortSignal; onUpdate: (patch: ReportRun) => Promise<void>; trustedFixture?: boolean };
const changedProperties = ['transform','opacity','box-shadow','border-color','background-color','color'];

export async function captureRun(run: ReportRun, options: CaptureOptions): Promise<ReportRun> {
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(90000)]);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const directory = runDirectory(run.id);
  const blocked = new Set<string>();
  const trustedOrigin = options.trustedFixture ? new URL(run.url).origin : undefined;
  let videoStart = 0;
  const elapsedSeconds = () => (performance.now() - videoStart) / 1000;
  const update = async (status: ReportRun['status'], stage: string) => { run.status = status; run.stage = stage; await options.onUpdate(structuredClone(run)); };
  const checkpoint = () => signal.throwIfAborted();
  const abortBrowser = () => { void context?.close().catch(() => {}); };
  const screenshot = async (name: string): Promise<string> => {
    checkpoint();
    await page!.screenshot({ path: join(directory, name), type: 'png', timeout: 5000 });
    run.media.files.push(name);
    return name;
  };
  const takeFrames = async (prefix: string, actionStart: number, count = 9): Promise<Frame[]> => {
    const frames: Frame[] = [];
    for (let i = 0; i < count; i++) {
      checkpoint();
      if (i) await page!.waitForTimeout(80);
      const elapsedMs = Math.round(performance.now() - actionStart);
      frames.push({ file: await screenshot(`${prefix}-${i}.png`), elapsedMs });
    }
    return frames;
  };
  try {
    checkpoint();
    if (!trustedOrigin) await validatePublicUrl(run.url);
    await mkdir(directory, { recursive: true });
    await update('loading', '打开参考页面');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: join(directory, 'raw'), size: { width: 1440, height: 900 } }, serviceWorkers: 'block', acceptDownloads: false });
    signal.addEventListener('abort', abortBrowser, { once: true });
    await context.routeWebSocket('**/*', ws => ws.close());
    await context.route('**/*', async route => {
      const request = route.request();
      try {
        if (!['GET','HEAD'].includes(request.method())) throw new Error('写入型请求已阻止');
        const target = new URL(request.url());
        const fixtureResource = trustedOrigin && target.origin === trustedOrigin && target.pathname.startsWith('/reference/');
        if (!fixtureResource) await validatePublicUrl(request.url());
        await route.continue();
      } catch {
        if (blocked.size < 20) { try { blocked.add(new URL(request.url()).origin); } catch {} }
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
    videoStart = performance.now();
    page = await context.newPage();
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    page.on('dialog', dialog => { void dialog.dismiss(); });
    page.on('download', download => { void download.cancel(); });
    page.setDefaultTimeout(6000);
    const response = await page.goto(run.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (response && response.status() >= 400) throw new Error(`原站返回 HTTP ${response.status()}，未获得可分析页面。`);
    await page.waitForTimeout(700);
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]));
    checkpoint();
    run.finalUrl = page.url();
    const raw = await collectPageEvidence(page);
    run.title = run.sourceKind === 'demo' ? 'Studio Reference' : raw.title || new URL(run.url).hostname;
    await screenshot('desktop.png');
    run.media.preview = 'desktop.png';
    run.findings = baseFindings(raw);
    run.coverage.viewports.push('1440×900');
    run.coverage.actions.push('页面读取：标题、字体、底色与布局');
    await update('observing', '观察悬停与滚动');

    for (const [index, target] of raw.targets.entries()) {
      checkpoint();
      if (run.findings.length >= 5) break;
      try {
        const locator = page.locator(target.selector).first();
        await locator.scrollIntoViewIfNeeded();
        await page.mouse.move(2, 895);
        await page.waitForTimeout(350);
        const before = await sampleElement(page, target.selector);
        const box = await locator.boundingBox();
        if (!box) continue;
        const clipStart = elapsedSeconds();
        const actionStart = performance.now();
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 400));
        const frames = await takeFrames(`hover-${index}`, actionStart);
        const after = await sampleElement(page, target.selector);
        const changed = changedProperties.filter(prop => before[prop] !== after[prop]);
        run.coverage.actions.push(`悬停：${target.label}`);
        if (!changed.length) continue;
        const words: Record<string, string> = { transform: '位置或形态', opacity: '透明度', 'box-shadow': '阴影', 'border-color': '边框颜色', 'background-color': '背景颜色', color: '文字颜色' };
        const finding: Finding = {
          id: `hover-${index}`, title: target.tag === 'button' ? '按钮悬停反馈' : index ? '链接悬停反馈' : '卡片悬停反馈', category: 'motion',
          summary: `鼠标移入“${target.label}”后，${changed.map(p => words[p]).join('、')}发生变化。这里保留了动作过程与前后样式，便于核对。`,
          trigger: '鼠标悬停', changes: changed.map(p => words[p]).join(' · '),
          implementation: '可从 CSS 过渡与 hover／focus-visible 状态开始；这是复现建议，原站是否采用同样实现尚未确认。',
          termIds: ['trigger.hover', ...(changed.includes('transform') ? ['effect.slide'] : []), 'parameter.duration','parameter.easing'],
          evidenceStatus: 'observed', selector: target.selector, screenshot: frames.at(-1)!.file, frames,
          clip: { file: 'recording.webm', startSeconds: clipStart, endSeconds: elapsedSeconds() },
          facts: [...changed.map(prop => ({ label: prop, value: `${before[prop]} → ${after[prop]}`, basis: 'measured' as const })), { label: 'transition-duration', value: after['transition-duration'], basis: 'measured' }, { label: '缓动曲线', value: after['transition-timing-function'], basis: 'measured' }],
          limitations: ['原站动画库未知；transform 的变化不等于已确认视差、磁吸或具体位移方向。', '关键帧时间相对于本次动作采样；视频区间按录制页创建时刻定位，可能存在少量启动偏差。']
        };
        run.findings.push(finding);
        await update('observing', '记录原站交互片段');
      } catch (error) {
        checkpoint();
        run.warnings.push(`一个悬停目标未能完整记录：${error instanceof Error ? error.message.split('\n')[0] : '目标变化'}`);
      }
    }

    await page.mouse.move(2, 2);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150);
    const scrollBefore = await Promise.all(raw.revealTargets.map(async t => ({ target: t, before: await sampleElement(page!, t.selector).catch(() => ({} as Record<string, string>)) })));
    const scrollStart = elapsedSeconds();
    const scrollActionStart = performance.now();
    const scrollFrames: Frame[] = [];
    const scrollChanges: { selector: string; before: string; after: string }[] = [];
    const maxScroll = Math.max(0, raw.height - 900);
    for (let i = 0; i < 9 && maxScroll > 0; i++) {
      checkpoint();
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), maxScroll * i / 8);
      await page.waitForTimeout(140);
      scrollFrames.push({ file: await screenshot(`scroll-${i}.png`), elapsedMs: Math.round(performance.now() - scrollActionStart) });
      for (const item of scrollBefore) {
        const after = await sampleElement(page, item.target.selector).catch(() => ({} as Record<string, string>));
        if (after.opacity !== undefined && item.before.opacity !== undefined && after.opacity !== item.before.opacity && !scrollChanges.some(x => x.selector === item.target.selector)) {
          scrollChanges.push({ selector: item.target.selector, before: item.before.opacity, after: after.opacity });
        }
      }
    }
    run.coverage.actions.push(`滚动采样：${scrollFrames.length}个位置，页面高度${raw.height}px`);
    if (scrollChanges.length && run.findings.length < 6) {
      run.findings.push({ id: 'scroll-reveal', title: '滚动显现', category: 'motion', summary: `滚动经过页面时，${scrollChanges.length}个目标的透明度发生了变化。可以参考原站片段判断是否符合你想要的进入效果。`, trigger: '滚动经过目标区域', changes: '透明度随观察过程变化', implementation: '候选方案是进入视口后触发淡入；是否跟随滚动进度、是否重播还需要进一步观察。', termIds: ['trigger.in-view','effect.fade','trigger.scroll-linked'], evidenceStatus: 'candidate', selector: scrollChanges[0].selector, screenshot: scrollFrames.at(-1)!.file, frames: scrollFrames, clip: { file: 'recording.webm', startSeconds: scrollStart, endSeconds: elapsedSeconds() }, facts: scrollChanges.map(x => ({ label: 'opacity', value: `${x.before} → ${x.after}`, basis: 'measured' })), limitations: ['已观察到变化，触发语义仍是候选；未确认是滚动触发还是滚动联动。'] });
    }

    await update('processing', '检查移动布局并整理报告');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    await screenshot('mobile.png');
    const mobile = await collectPageEvidence(page);
    run.coverage.viewports.push('390×844');
    if (run.findings.length < 6) run.findings.push({ id: 'mobile-layout', title: '移动端布局', category: 'device', summary: '在390px视口重新观察同一页面，保留移动端画面。请结合桌面画面对照内容重排、文字和导航。', trigger: '视口缩窄', changes: '移动端结构采样', implementation: '根据内容设置响应式断点，保持主要信息与操作可用；不能只把桌面整体缩小。', termIds: ['rule.input-modality','layout.responsive'], evidenceStatus: 'observed', screenshot: 'mobile.png', frames: [], facts: [{ label: '视口', value: '390×844', basis: 'measured' }, { label: '标题字号', value: mobile.headingSize, basis: 'measured' }], limitations: ['这是Chromium窄视口，不代表真实手机或Safari验证；未执行触摸手势。'] });
    run.coverage.limits.push('视频为桌面录制；移动端仅保留结构截图。', '关键帧标签为动作采样实测时间，不是视频编码时间戳。');
    if (!run.findings.some(f => f.category === 'motion')) run.warnings.push('本轮没有观察到可确认的动效变化，报告保留静态设计观察。');
    checkpoint();
    run.status = 'completed'; run.stage = '拆解完成';
  } catch (error) {
    const cancelled = options.signal.aborted;
    run.status = cancelled ? 'cancelled' : run.findings.length ? 'partial' : 'failed';
    run.stage = cancelled ? '已取消' : run.findings.length ? '部分完成' : '无法完成拆解';
    run.error = signal.aborted && !cancelled ? '采集达到90秒上限，已停止。' : cancelled ? undefined : error instanceof Error ? error.message.split('\n')[0] : '采集失败。';
  } finally {
    signal.removeEventListener('abort', abortBrowser);
    const video = page?.video();
    await context?.close().catch(() => {});
    if (video) {
      try {
        const source = await video.path();
        if (basename(source) !== 'recording.webm') await rename(source, join(directory, 'recording.webm'));
        run.media.video = 'recording.webm'; run.media.files.push('recording.webm');
      } catch { run.warnings.push('视频未能保存；可查看已采集的截图与关键帧。'); }
    }
    await browser?.close().catch(() => {});
    if (blocked.size) run.warnings.push(`已阻止受限网络请求：${[...blocked].join('、')}`);
    run.media.files = [...new Set(run.media.files)];
    await options.onUpdate(structuredClone(run));
  }
  return run;
}
