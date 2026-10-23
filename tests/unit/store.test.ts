import { it, expect } from 'vitest';
import { safeRunId, safeMediaName } from '../../server/store';
it('permits only UUID run ids', () => {
  expect(safeRunId('c28b0921-5aa5-49c2-86ea-d13a751448df')).toBe(true);
  expect(safeRunId('../../etc')).toBe(false);
});
it.each(['../secret.png', 'a/secret.png', '..%2fsecret.png', 'run.json', 'video.svg', '.hidden.png'])('rejects invalid media %s', value => {
  expect(safeMediaName(value)).toBe(false);
});
it('permits the registered image/video filename shapes', () => {
  expect(safeMediaName('hover-1-3.png')).toBe(true);
  expect(safeMediaName('abc123.webm')).toBe(true);
});
