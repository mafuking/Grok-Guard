import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createStore } from "./store.js";

test("load drops stuck pending rows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "guard-store-"));
  try {
    await writeFile(
      path.join(dir, "samples.json"),
      JSON.stringify([
        { id: "done", pending: false, title: "ok" },
        { id: "stuck", pending: true, title: "timing" },
      ]),
    );
    const store = createStore(dir);
    await store.load();
    const ids = store.list().map((s) => s.id);
    assert.deepEqual(ids, ["done"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
