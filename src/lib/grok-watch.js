import { watch, existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

function grokSessionsRoot() {
  return path.join(os.homedir(), ".grok", "sessions");
}

async function walkUpdates(dir, out = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walkUpdates(full, out);
    else if (ent.name === "updates.jsonl") out.push(full);
  }
  return out;
}

async function sessionMeta(updatesFile) {
  const summaryFile = path.join(path.dirname(updatesFile), "summary.json");
  try {
    const info = JSON.parse(await readFile(summaryFile, "utf8"));
    return {
      title: info.generated_title || info.session_summary || info.last_turn_summary || "",
      model: info.current_model_id || "",
    };
  } catch {
    return { title: "", model: "" };
  }
}

function parseTurn(line) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return null;
  }
  const update = row?.params?.update;
  if (update?.sessionUpdate !== "turn_completed") return null;
  const usage = update.usage;
  if (!usage?.outputTokens || !usage?.apiDurationMs) return null;
  const meta = row?._meta || {};
  return {
    id: update.prompt_id || meta.eventId,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens || 0,
    durationMs: usage.apiDurationMs,
    firstTokenMs: usage.timeToFirstTokenMs || usage.firstTokenMs || 0,
    model: Object.keys(usage.modelUsage || {})[0] || "grok-build",
  };
}

export function startGrokWatch({ onTurn, seen }) {
  const root = grokSessionsRoot();
  const offsets = new Map();

  async function ingestFile(file, bootstrap = false) {
    let text = "";
    try {
      text = await readFile(file, "utf8");
    } catch {
      return;
    }
    if (bootstrap && !offsets.has(file)) {
      offsets.set(file, text.length);
      return;
    }
    const from = offsets.get(file) || 0;
    if (text.length < from) offsets.set(file, 0);
    const start = offsets.get(file) || 0;
    const chunk = text.slice(start);
    offsets.set(file, text.length);
    if (!chunk) return;
    for (const line of chunk.split("\n")) {
      const turn = parseTurn(line);
      if (!turn || seen.has(turn.id)) continue;
      seen.add(turn.id);
      const meta = await sessionMeta(file);
      await onTurn({
        ...turn,
        title: meta.title,
        model: turn.model || meta.model,
      });
    }
  }

  async function scan() {
    if (!existsSync(root)) return;
    const files = await walkUpdates(root);
    for (const file of files) await ingestFile(file, true);
  }

  void scan();
  let watcher = null;
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith("updates.jsonl")) return;
      void ingestFile(path.join(root, filename));
    });
  } catch {
    setInterval(() => void scan(), 3000);
  }
  return () => watcher?.close();
}
