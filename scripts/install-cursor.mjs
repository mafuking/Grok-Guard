import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extSrc = path.join(root, "cursor-extension");
const pkg = JSON.parse(await readFile(path.join(extSrc, "package.json"), "utf8"));
const dest = path.join(os.homedir(), ".cursor", "extensions", `${pkg.publisher}.${pkg.name}-${pkg.version}`);
const hooksFile = path.join(os.homedir(), ".cursor", "hooks.json");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

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

if (!existsSync(path.join(extSrc, "node_modules"))) {
  run("npm", ["install"], extSrc);
}
run("npm", ["run", "compile"], extSrc);

await mkdir(dest, { recursive: true });
await cp(path.join(extSrc, "package.json"), path.join(dest, "package.json"));
await cp(path.join(extSrc, "out"), path.join(dest, "out"), { recursive: true });
if (existsSync(path.join(extSrc, "media"))) {
  await cp(path.join(extSrc, "media"), path.join(dest, "media"), { recursive: true });
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

console.log(`扩展已装到 ${dest}`);
console.log(`hooks 已写入 ${hooksFile}`);
console.log("在 Cursor 里执行 Developer: Reload Window 后，看左侧地球图标。");
