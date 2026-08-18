import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksFile = path.join(os.homedir(), ".cursor", "hooks.json");

function hookPath(file) {
  return path.join(root, "hooks", file).replaceAll("\\", "/");
}

function upsertHook(config, event, file) {
  const command = `node ${hookPath(file)}`;
  const list = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
  const idx = list.findIndex((item) => {
    const cmd = String(item?.command || "").replaceAll("\\", "/");
    return cmd.endsWith(`/hooks/${file}`) || cmd.endsWith(`hooks/${file}`);
  });
  const entry = { command, timeout: 8 };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  config.hooks[event] = list;
}

let hooks = { version: 1, hooks: {} };
if (existsSync(hooksFile)) {
  try {
    const parsed = JSON.parse(await readFile(hooksFile, "utf8"));
    if (parsed && typeof parsed === "object") hooks = parsed;
    if (!hooks.hooks || typeof hooks.hooks !== "object") hooks.hooks = {};
    if (!hooks.version) hooks.version = 1;
  } catch {
    hooks = { version: 1, hooks: {} };
  }
}

upsertHook(hooks, "beforeSubmitPrompt", "on-submit.mjs");
upsertHook(hooks, "afterAgentThought", "on-thought.mjs");
upsertHook(hooks, "afterAgentResponse", "on-response.mjs");

await mkdir(path.dirname(hooksFile), { recursive: true });
await writeFile(hooksFile, `${JSON.stringify(hooks, null, 2)}\n`);

console.log(`hooks 已写入 ${hooksFile}`);
console.log("在 Cursor 里执行 Developer: Reload Window 后，发一条 Agent 对话即可。结果看 http://127.0.0.1:3780");
