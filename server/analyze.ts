import type { Page } from '@playwright/test';
import type { Finding } from '../shared/types';

export interface ElementSample { selector: string; label: string; tag: string; styles: Record<string, string> }
export interface PageEvidence {
  title: string; heading: string; font: string; headingSize: string; background: string; color: string;
  layouts: { selector: string; display: string; columns: string; gap: string; label: string }[];
  targets: ElementSample[]; revealTargets: ElementSample[]; height: number;
}

export async function collectPageEvidence(page: Page): Promise<PageEvidence> {
  return page.evaluate(() => {
    const selector = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts: string[] = [];
      for (let node: Element | null = element; node && node !== document.body && parts.length < 6; node = node.parentElement) {
        const tag = node.tagName.toLowerCase();
        const siblings = node.parentElement ? [...node.parentElement.children].filter(x => x.tagName === node!.tagName) : [];
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
      }
      return 'body > ' + parts.join(' > ');
    };
    const properties = ['transform','opacity','box-shadow','border-color','background-color','color','transition-duration','transition-timing-function','animation-name','animation-duration'];
    const sample = (el: Element): ElementSample => ({
      selector: selector(el), tag: el.tagName.toLowerCase(),
      label: (el.querySelector('h1,h2,h3')?.textContent || el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 100),
      styles: Object.fromEntries(properties.map(prop => [prop, getComputedStyle(el).getPropertyValue(prop)]))
    });
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 60 && r.height > 20 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const elements = [...document.querySelectorAll('main,section,header,article,div')].slice(0, 2500).filter(visible);
    const layouts = elements.filter(el => ['grid','flex'].includes(getComputedStyle(el).display)).slice(0, 12).map(el => {
      const s = getComputedStyle(el); return { selector: selector(el), display: s.display, columns: s.gridTemplateColumns, gap: s.gap, label: (el.getAttribute('aria-label') || el.querySelector('h2')?.textContent || el.tagName).trim().slice(0, 80) };
    });
    const targets = [...document.querySelectorAll('a,button,[role="button"],article')].filter(visible).sort((a, b) => Number(!!b.querySelector('img')) - Number(!!a.querySelector('img'))).slice(0, 3).map(sample);
    const revealTargets = elements.filter(el => { const s = getComputedStyle(el); return Number(s.opacity) < .99 || ((el.className || '').toString().match(/reveal|animate/) && s.transitionDuration !== '0s'); }).slice(0, 8).map(sample);
    const heading = document.querySelector('h1');
    const body = getComputedStyle(document.body);
    return { title: document.title.slice(0, 180), heading: (heading?.textContent || document.title).trim().slice(0, 180), font: body.fontFamily, headingSize: heading ? getComputedStyle(heading).fontSize : body.fontSize, background: body.backgroundColor, color: body.color, layouts, targets, revealTargets, height: document.documentElement.scrollHeight };
  });
}

export async function sampleElement(page: Page, selector: string): Promise<Record<string, string>> {
  return page.locator(selector).first().evaluate(el => {
    const s = getComputedStyle(el);
    return Object.fromEntries(['transform','opacity','box-shadow','border-color','background-color','color','transition-duration','transition-timing-function','animation-name','animation-duration'].map(p => [p, s.getPropertyValue(p)]));
  });
}

export function baseFindings(raw: PageEvidence): Finding[] {
  const shared = { evidenceStatus: 'observed' as const, frames: [], limitations: ['这是页面数据与画面观察，未重建原站源码。'] };
  const findings: Finding[] = [{
    ...shared, id: 'first-screen', title: '首屏与排版', category: 'structure',
    summary: `首屏以“${raw.heading}”组织主要信息。标题尺寸与正文层级、页面底色构成了这个页面的视觉起点。`,
    trigger: '页面打开后', changes: '静态结构与字体层级', implementation: '使用语义化标题、容器宽度和响应式字号建立相近层级；需要结合你自己的内容调整。',
    termIds: ['structure.hero','style.editorial'], screenshot: 'desktop.png',
    facts: [{ label: '标题字号', value: raw.headingSize, basis: 'measured' }, { label: '正文字体', value: raw.font, basis: 'measured' }, { label: '页面底色', value: raw.background, basis: 'measured' }, { label: '正文颜色', value: raw.color, basis: 'measured' }]
  }];
  if (raw.layouts.length) {
    const grid = raw.layouts.find(l => l.display === 'grid') || raw.layouts[0];
    findings.push({ ...shared, id: 'content-layout', title: grid.display === 'grid' ? '内容网格' : '内容排列', category: 'structure',
      summary: `页面中观察到 ${grid.display === 'grid' ? 'CSS Grid 网格' : 'Flex 弹性排列'}，用于组织内容。具体列数与间距以读取结果为准。`,
      trigger: '页面布局', changes: '内容区域的排列关系', implementation: `可以用 ${grid.display === 'grid' ? 'CSS Grid' : 'Flexbox'} 建立排列，窄屏时按内容重排。`,
      termIds: grid.display === 'grid' ? ['layout.bento'] : ['layout.split-screen'], selector: grid.selector, screenshot: 'desktop.png',
      facts: [{ label: 'display', value: grid.display, basis: 'measured' }, { label: 'grid-template-columns', value: grid.columns, basis: 'measured' }, { label: 'gap', value: grid.gap, basis: 'measured' }],
      limitations: ['网格不一定是 Bento，分栏也不一定是分屏；关联术语仅作理解入口，不能据此确定视觉风格。']
    });
  }
  return findings;
}
