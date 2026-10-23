import type { DictionaryTerm } from './types';
import examples from '../docs/dictionary/dictionary-examples.json';
import catalogue from '../docs/dictionary/catalogue.json';

export const sources = catalogue.sources;
const additions: DictionaryTerm[] = [
  { id:'technique.css-grid', name:{zh:'CSS网格布局',en:'CSS Grid'}, summary:'按照行与列组织内容的二维布局技术。', mechanism:'通过列、行、间距和跨格关系组织内容，窄屏时可以重新定义轨道。', kind:'technique', domains:['structure'], aliases:['Grid Layout'],plainQueries:['网页一行排几列'],distinctions:['使用Grid不代表视觉上一定是Bento布局。'],relations:[],parameters:[{key:'gap',unit:'CSS length',meaning:'网格间距'}],rules:[],sources:[{sourceId:'visual-upper',locatorId:'visual.upper.05',usage:'项目扩写'}],editorialStatus:'draft'},
  { id:'technique.flexbox', name:{zh:'弹性布局',en:'Flexbox'}, summary:'沿一个主要方向排列并对齐一组元素。', mechanism:'适合一行或一列中的分布、对齐和换行；需要结合内容指定方向和缩放规则。',kind:'technique',domains:['structure'],aliases:['Flex Layout'],plainQueries:['一排元素对齐'],distinctions:['Flexbox是技术，分屏是视觉布局模式。'],relations:[],parameters:[],rules:[],sources:[{sourceId:'visual-upper',locatorId:'visual.upper.06',usage:'项目扩写'}],editorialStatus:'draft'},
  { id:'layout.responsive',name:{zh:'响应式布局',en:'Responsive Layout'},summary:'根据可用空间重新排列内容和操作。',mechanism:'通过视口或容器条件调整列数、导航、字号和内容次序，而非整体缩小桌面界面。',kind:'layout',domains:['structure','device'],aliases:['响应式'],plainQueries:['手机上变成一列'],distinctions:['窄视口截图不能替代真实设备、触摸和浏览器测试。'],relations:[],parameters:[],rules:[],sources:[{sourceId:'visual-upper',locatorId:'visual.upper.09',usage:'项目扩写'}],editorialStatus:'draft'}
];
export const terms: DictionaryTerm[] = [...examples.terms as DictionaryTerm[], ...additions];
export const termMap = new Map(terms.map(t => [t.id, t]));
export function searchTerms(query: string, domain = '') {
  const q = query.trim().toLocaleLowerCase();
  return terms.filter(term => (!domain || term.domains.includes(domain)) && (!q || [term.name.zh,term.name.en,...term.aliases,...term.plainQueries,term.summary].join(' ').toLocaleLowerCase().includes(q)));
}
export const domains: Record<string,string> = {structure:'结构与布局',style:'视觉风格',motion:'动效与触发',component:'组件与导航',workspace:'工具与流程',data:'数据展示',ai:'AI交互',state:'状态与恢复',device:'设备与输入',quality:'体验与验收'};
