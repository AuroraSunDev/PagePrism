/** Authored, synthetic behavior gold. This is not a real-site accuracy dataset. */
export interface GoldCheck {
  selector: string;
  trigger: "hover" | "automatic" | "scroll";
  property: string;
  valueIncludes?: string;
}
export interface EvaluationCase {
  id: string;
  title: string;
  html?: string;
  url?: string;
  expected: GoldCheck[];
  noObservedHover?: string[];
}
const page = (body: string, css = "", script = "") =>
  `<!doctype html><html><meta charset="utf-8"><title>Behavior evaluation</title><style>body{margin:0;padding:36px;font:20px system-ui;background:#eee9df}h1{font-size:36px}.unit{display:inline-block;width:260px;height:150px;background:#e9a04f;cursor:pointer;position:relative}button.unit{border:0} ${css}</style><h1>Interaction reference</h1>${body}<script>${script}</script></html>`;
const hover = (property: string, valueIncludes?: string): GoldCheck => ({
  selector: "#control",
  trigger: "hover",
  property,
  valueIncludes,
});
export const evaluationCases: EvaluationCase[] = [
  {
    id: "declared-delay",
    title: "声明延迟的图像反馈",
    html: page(
      '<div id="control" class="unit" tabindex="0">Cover</div>',
      "#control{filter:grayscale(1);transition:filter .15s 1.1s}#control:hover{filter:none}",
    ),
    expected: [hover("filter", "none")],
  },
  {
    id: "script-delay",
    title: "脚本延迟的指针反馈",
    html: page(
      '<div id="control" class="unit" tabindex="0">Poster</div>',
      "#control{filter:grayscale(1)}",
      `const c=document.querySelector('#control');let timer;c.onpointerenter=()=>timer=setTimeout(()=>c.style.filter='none',1100);c.onpointerleave=()=>{clearTimeout(timer);c.style.filter='grayscale(1)'}`,
    ),
    expected: [hover("filter", "none")],
  },
  {
    id: "ensemble",
    title: "主体、子元素与提示组合",
    html: page(
      '<div id="control" class="unit" tabindex="0"><span id="shape">◆</span></div><div id="hint" role="tooltip" style="display:none;position:absolute;left:360px;top:150px">Detail revealed</div>',
      "#control{filter:grayscale(1)}#control:hover{filter:none}#shape{display:block;font-size:70px;transition:transform .2s .8s}#control:hover #shape{transform:translateY(-14px)}",
      `const c=document.querySelector('#control'),h=document.querySelector('#hint');c.onpointerenter=()=>h.style.display='block';c.onpointerleave=()=>h.style.display='none'`,
    ),
    expected: [
      hover("filter"),
      hover("transform"),
      hover("出现的文字", "Detail revealed"),
    ],
  },
  {
    id: "nearby-timer",
    title: "自主文字旁的真实提示",
    html: page(
      '<div id="control" class="unit" tabindex="0">Artwork</div><div id="counter" style="position:absolute;left:320px;top:145px">0</div><div id="hint" role="tooltip" style="display:none;position:absolute;left:320px;top:210px">Detail revealed</div>',
      "",
      `let n=0;setInterval(()=>document.querySelector('#counter').textContent=String(++n),50);const c=document.querySelector('#control'),h=document.querySelector('#hint');c.onpointerenter=()=>h.style.display='block';c.onpointerleave=()=>h.style.display='none'`,
    ),
    expected: [hover("出现的文字", "Detail revealed")],
  },
  {
    id: "later-motion",
    title: "后续区域的独立动画",
    html: page(
      '<div style="height:1000px">Scroll onward</div><h2 id="control">Later title</h2><footer style="height:650px"></footer>',
      "#control{width:300px;animation:sway 2s alternate infinite}@keyframes sway{to{transform:translateX(65px)}}",
    ),
    expected: [
      { selector: "#control", trigger: "scroll", property: "transform" },
    ],
  },
  {
    id: "vector",
    title: "矢量子元素反馈",
    html: page(
      '<svg id="control" class="unit" tabindex="0" viewBox="0 0 260 150"><circle cx="130" cy="75" r="48"/></svg>',
      "#control circle{fill:#315be8;transition:fill .2s}#control:hover circle{fill:#e53452}",
    ),
    expected: [hover("fill")],
  },
  {
    id: "static",
    title: "静态可操作外观反例",
    html: page('<button id="control" class="unit">Plain control</button>'),
    expected: [],
    noObservedHover: ["#control"],
  },
  {
    id: "autonomous",
    title: "自主文字不是悬停反馈",
    html: page(
      '<button id="control" class="unit">Count 0</button>',
      "",
      `let n=0;setInterval(()=>document.querySelector('#control').textContent='Count '+(++n),50)`,
    ),
    expected: [
      { selector: "#control", trigger: "automatic", property: "文字变化" },
    ],
    noObservedHover: ["#control"],
  },
];
