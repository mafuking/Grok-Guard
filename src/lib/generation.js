import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { estimateTokens } from "./tokens.js";

function pickSession(sessions, conversationId) {
  if (conversationId) {
    const hit = [...sessions].reverse().find((s) => s.conversationId === conversationId);
    if (hit) return hit;
  }
  return sessions[sessions.length - 1] || null;
}

export function createGeneration(dataDir) {
  const file = path.join(dataDir, "generation.json");
  let sessions = [];

  async function persist() {
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, JSON.stringify(sessions, null, 2));
  }

  return {
    async load() {
      try {
        const data = JSON.parse(await readFile(file, "utf8"));
        if (Array.isArray(data)) sessions = data;
        else if (data && data.startedAt) sessions = [data];
        else sessions = [];
      } catch {
        sessions = [];
      }
    },
    get() {
      return sessions[sessions.length - 1] || null;
    },
    list() {
      return sessions.slice();
    },
    async start(partial) {
      const session = {
        id: partial.id || randomUUID(),
        sampleId: partial.sampleId || "",
        source: partial.source || "cursor-hook",
        startedAt: Date.now(),
        firstTokenAt: null,
        thoughtTokens: 0,
        ip: partial.ip || null,
        title: partial.title || "",
        titleFull: partial.titleFull || partial.title || "",
        model: partial.model || "",
        conversationId: partial.conversationId || "",
      };
      sessions.push(session);
      await persist();
      return session;
    },
    async thought(text, conversationId) {
      const session = pickSession(sessions, conversationId);
      if (!session) return null;
      if (!session.firstTokenAt) session.firstTokenAt = Date.now();
      session.thoughtTokens += estimateTokens(text);
      await persist();
      return session;
    },
    async take(conversationId) {
      const session = pickSession(sessions, conversationId);
      if (!session) return null;
      sessions = sessions.filter((s) => s.id !== session.id);
      await persist();
      return session;
    },
  };
}
