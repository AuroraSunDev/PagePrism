import { it, expect } from 'vitest';
import { terms, sources, searchTerms } from '../../shared/dictionary';
it('adapts actual term definitions without fictional observations', () => {
  expect(terms.length).toBeGreaterThanOrEqual(46);
  expect(new Set(terms.map(t=>t.id)).size).toBe(terms.length);
  expect(JSON.stringify(terms)).not.toContain('demo.observation');
  for (const term of terms) for (const source of term.sources) expect(sources.some(s=>s.id===source.sourceId)).toBe(true);
});
it('finds Chinese, English, aliases and plain descriptions', () => {
  for (const q of ['磁吸','Magnetic','按钮被鼠标吸过去']) expect(searchTerms(q).some(t=>t.id==='effect.magnetic')).toBe(true);
  expect(searchTerms('不存在的词xyz')).toHaveLength(0);
});
