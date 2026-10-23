import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureRun } from '../../server/capture';
import { createRun, runDirectory } from '../../server/store';

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const file = req.url?.endsWith('.png') ? 'architecture.png' : 'index.html';
    res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
    res.end(await readFile(join('public/reference', file)));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/reference/`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('real browser evidence', () => {
  it('records original media, real hover changes and strictly increasing sampled times', async () => {
    const result = await captureRun(createRun(base, 'demo'), { signal: new AbortController().signal, onUpdate: async () => {}, trustedFixture: true });
    expect(['completed', 'partial']).toContain(result.status);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.length).toBeLessThanOrEqual(6);
    const hover = result.findings.find(f => f.trigger.includes('悬停'));
    expect(hover).toBeDefined();
    expect(hover!.facts.some(f => f.label.includes('transform'))).toBe(true);
    expect(hover!.frames.length).toBeGreaterThanOrEqual(4);
    expect(hover!.frames.every((f, i, all) => i === 0 || f.elapsedMs > all[i - 1].elapsedMs)).toBe(true);
    expect(result.coverage.viewports).toContain('390×844');
    expect(result.media.video).toBeTruthy();
    expect((await stat(join(runDirectory(result.id), result.media.video!))).size).toBeGreaterThan(1000);
    const png = await readFile(join(runDirectory(result.id), hover!.screenshot));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
  it('honors cancellation before launching a browser', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await captureRun(createRun(base, 'demo'), { signal: controller.signal, onUpdate: async () => {}, trustedFixture: true });
    expect(result.status).toBe('cancelled');
  });
});
