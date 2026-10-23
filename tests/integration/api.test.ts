import { beforeAll, afterAll, it, expect } from "vitest";
import type { Server } from "node:http";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../server/index";
import { createRun, runDirectory, saveRun } from "../../server/store";
let server: Server;
let base: string;
let temp: string;
const previous = process.env.PAGEPRISM_DATA_DIR;
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "pageprism-api-"));
  process.env.PAGEPRISM_DATA_DIR = join(temp, ".pageprism", "runs");
  server = await startServer(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(temp, { recursive: true, force: true });
  if (previous === undefined) delete process.env.PAGEPRISM_DATA_DIR;
  else process.env.PAGEPRISM_DATA_DIR = previous;
});
it("rejects a private URL before creating a browser job", async () => {
  const result = await fetch(base + "/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1" }),
  });
  expect(result.status).toBe(400);
  expect((await result.json()).error).toBeTruthy();
});
it("rejects cross-origin attempts to create a local job", async () => {
  const result = await fetch(base + "/api/runs/demo", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  expect(result.status).toBe(403);
});
it("returns readable errors for unknown run or unregistered media", async () => {
  expect((await fetch(base + "/api/runs/not-a-run")).status).toBe(404);
  expect(
    (
      await fetch(
        base +
          "/api/runs/c28b0921-5aa5-49c2-86ea-d13a751448df/media/secret.png",
      )
    ).status,
  ).toBe(404);
});
it("serves registered PNG media from the private run directory", async () => {
  const run = createRun("https://example.com", "public");
  run.media.files = ["desktop.png"];
  await mkdir(runDirectory(run.id), { recursive: true });
  await copyFile(
    "public/reference/architecture.png",
    join(runDirectory(run.id), "desktop.png"),
  );
  await saveRun(run);
  const response = await fetch(base + `/api/runs/${run.id}/media/desktop.png`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  const image = Buffer.from(await response.arrayBuffer());
  expect(image.subarray(1, 4).toString()).toBe("PNG");
});
it("limits concurrent jobs and accepts cancellation", async () => {
  const first = await fetch(base + "/api/runs/demo", { method: "POST" });
  expect(first.status).toBe(202);
  const run = await first.json();
  expect(
    (await fetch(base + "/api/runs/demo", { method: "POST" })).status,
  ).toBe(409);
  expect(
    (await fetch(base + `/api/runs/${run.id}/cancel`, { method: "POST" }))
      .status,
  ).toBe(200);
  await expect
    .poll(
      async () =>
        (await (await fetch(base + `/api/runs/${run.id}`)).json()).status,
      { timeout: 10000 },
    )
    .toBe("cancelled");
});
