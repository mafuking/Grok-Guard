import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createGeneration } from "./generation.js";

test("unmatched conversationId does not steal another session", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "guard-gen-"));
  try {
    const gen = createGeneration(dir);
    await gen.start({ conversationId: "a", title: "A" });
    await gen.start({ conversationId: "b", title: "B" });
    assert.equal(await gen.take("missing"), null);
    assert.equal(gen.list().length, 2);
    const took = await gen.take("a");
    assert.equal(took.conversationId, "a");
    assert.equal(gen.list().length, 1);
    assert.equal(gen.list()[0].conversationId, "b");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("same conversation replaces the previous open session", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "guard-gen-"));
  try {
    const gen = createGeneration(dir);
    await gen.start({ conversationId: "a", title: "old" });
    await gen.start({ conversationId: "a", title: "new" });
    assert.equal(gen.list().length, 1);
    assert.equal(gen.list()[0].title, "new");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
