import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const CACHE_MS = 1500;
let cache = { at: 0, value: null };

function dbPath() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
  }
  return path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb");
}

function openDb() {
  return new DatabaseSync(dbPath(), { readOnly: true });
}

function textValue(row) {
  if (!row) return "";
  const value = row.value ?? row[0];
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return value == null ? "" : String(value);
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readFresh(preferredId) {
  const empty = { conversationId: "", title: "", model: "" };
  let db;
  try {
    db = openDb();
  } catch {
    return empty;
  }

  try {
    const selected = textValue(
      db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursor/glass.selectedAgent"),
    ).trim();
    const latest = db
      .prepare("SELECT composerId FROM composerHeaders WHERE IFNULL(isArchived, 0) = 0 ORDER BY lastUpdatedAt DESC LIMIT 1")
      .get();
    const latestId = latest?.composerId ? String(latest.composerId) : "";
    const conversationId = String(preferredId || latestId || selected || "").trim();
    let title = "";
    let model = "";

    if (conversationId) {
      const header = db.prepare("SELECT value FROM composerHeaders WHERE composerId = ?").get(conversationId);
      const head = parseJson(textValue(header));
      if (head?.name) title = String(head.name).trim();

      const blob = db.prepare("SELECT value FROM cursorDiskKV WHERE key = ?").get(`composerData:${conversationId}`);
      const data = parseJson(textValue(blob));
      if (!title && data?.name) title = String(data.name).trim();
      model = String(data?.modelConfig?.modelName || "").trim();
    }

    if (!model) {
      const raw = textValue(
        db
          .prepare("SELECT value FROM ItemTable WHERE key = ?")
          .get("src.vs.platform.reactivestorage.browser.reactiveStorageServiceImpl.persistentStorage.applicationUser"),
      );
      const settings = parseJson(raw);
      model = String(settings?.aiSettings?.modelConfig?.composer?.modelName || "").trim();
    }

    return { conversationId, title, model };
  } catch {
    return empty;
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

export function readCursorMeta(preferredId = "") {
  const now = Date.now();
  const want = String(preferredId || "");
  if (cache.value && now - cache.at < CACHE_MS && cache.want === want) return cache.value;
  const value = readFresh(want);
  cache = { at: now, want, value };
  return value;
}
