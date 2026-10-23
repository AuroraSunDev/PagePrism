import { it, expect, vi, afterEach } from "vitest";
import { loadDraft } from "../../src/core";
afterEach(() => vi.unstubAllGlobals());
it("keeps all selected observations beyond the original six after reload", () => {
  const saved = loadDraft("initial");
  saved.selected = Array.from({ length: 12 }, (_, i) => "effect-" + i);
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(saved) });
  expect(loadDraft("saved").selected).toEqual(saved.selected);
});
