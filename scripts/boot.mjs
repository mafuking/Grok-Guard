import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooks = spawnSync(process.execPath, [path.join(root, "scripts", "install-hooks.mjs")], {
  stdio: "inherit",
});
if (hooks.status !== 0) {
  console.warn("[warn] hooks write failed, starting the dashboard anyway.");
}
await import(pathToFileURL(path.join(root, "src", "server.js")).href);
