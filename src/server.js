import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupEgress } from "./lib/ip.js";
import { randomUUID } from "node:crypto";
import { classifyTps, combineVerdict, computeTps, LABELS, scoreIp } from "./lib/score.js";
import { createStore } from "./lib/store.js";
import { createGeneration } from "./lib/generation.js";
import { estimateTokens } from "./lib/tokens.js";
import { startGrokWatch } from "./lib/grok-watch.js";
import { readCursorMeta } from "./lib/cursor-meta.js";
import {
  abbreviateTitle,
  formatIpCell,
  formatModel,
  leftoverRemarks,
  presentSample,
  titleFromPrompt,
} from "./lib/sample-view.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3780;
const clients = new Set();

function notifyClients() {
  const payload = `data: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

const dataDir = path.join(__dirname, "..", "data");
const store = createStore(dataDir, notifyClients);
const generation = createGeneration(dataDir);
let cache = null;

function latestOf(kind) {
  return store.list().find((s) => s.kind === kind) || null;
}

async function lookupStatus() {
  const egress = await lookupEgress();
  const ipScore = scoreIp(egress.geo);
  const latestTps = latestOf("tps");
  const tpsClass = latestTps ? { ...latestTps, ...classifyTps(latestTps) } : null;
  const combined = combineVerdict({
    ipScore,
    tpsClass,
    ipv4: egress.ipv4,
    ipv6: egress.ipv6,
    ipv6Leak: egress.ipv6Leak,
  });
  cache = { ...egress, ipScore, latestSample: latestTps, ...combined };
  return cache;
}

function emptyStatus() {
  const pending = generation.get();
  const last = latestOf("tps") || latestOf("ip");
  let base;
  if (cache) base = { ...cache };
  else if (last) {
    base = {
      ipv4: last.ipv4 || null,
      ipv6: last.ipv6 || null,
      ipv6Leak: Boolean(last.ipv6Leak),
      geo: last.geo || {},
      ipScore: last.ipScore || { band: "medium", risk: 0, reasons: [] },
      verdict: last.verdict || last.level || "watch",
      verdictLabel: last.verdictLabel || last.levelLabel || "需关注",
      ipRiskLabel: last.ipRiskLabel || "",
      summary: last.summary || "",
      checkedAt: last.at,
      notes: [],
    };
  } else {
    base = {
      ipv4: null,
      ipv6: null,
      ipv6Leak: false,
      geo: {},
      ipScore: { band: "low", risk: 0, reasons: [] },
      verdict: "watch",
      verdictLabel: "尚未检测",
      ipRiskLabel: "",
      summary: "发送一条 Agents 对话，或点重新检测后再发送。回复结束后会出令牌/秒。",
      checkedAt: null,
      notes: [],
    };
  }
  base.pending = Boolean(pending) || store.list().some((s) => s.pending);
  return base;
}

function buildSample({
  id,
  at,
  pending = false,
  source,
  title = "",
  titleFull = "",
  model = "",
  ipv4 = null,
  ipv6 = null,
  geo = {},
  reasoningTokens = null,
  replyTokens = null,
  measured = {},
  classified = { level: "", reasons: [] },
  kind = "tps",
}) {
  const full = titleFull || title;
  const modelLabel = formatModel(model);
  return {
    id: id || randomUUID(),
    pending,
    kind,
    at: at || new Date().toISOString(),
    source,
    sourceLabel: LABELS.source[source] || source || "未知",
    title: abbreviateTitle(full) || "",
    titleFull: full,
    model: model || "",
    modelLabel,
    ipv4,
    ipv6,
    geo,
    ipLabel: formatIpCell(ipv4, geo),
    reasoningTokens,
    replyTokens,
    ...measured,
    ...classified,
    levelLabel: classified.level ? LABELS.level[classified.level] || classified.level : "",
    reasonLabels: pending
      ? []
      : leftoverRemarks({
          kind,
          reasoningTokens,
          reasons: classified.reasons,
          model,
          modelLabel,
        }),
  };
}

async function startGeneration(body = {}) {
  const source = body.source || "cursor-hook";
  const status = await lookupStatus();
  let titleFull = String(body.title || "").trim();
  let model = String(body.model || "").trim();
  let conversationId = String(body.conversationId || "").trim();
  if (source === "cursor-hook") {
    const meta = readCursorMeta(conversationId);
    conversationId = conversationId || meta.conversationId || "";
    titleFull = meta.title || titleFromPrompt(body.prompt) || titleFull;
    model = model || meta.model || "";
  }
  const sampleId = randomUUID();
  const pending = buildSample({
    id: sampleId,
    pending: true,
    source,
    titleFull,
    model,
    ipv4: status.ipv4,
    ipv6: status.ipv6,
    geo: status.geo,
  });
  await store.add(pending);
  await generation.start({
    id: sampleId,
    sampleId,
    source,
    title: abbreviateTitle(titleFull),
    titleFull,
    model,
    conversationId,
    ip: {
      ipv4: status.ipv4,
      ipv6: status.ipv6,
      ipv6Leak: status.ipv6Leak,
      geo: status.geo,
      ipScore: status.ipScore,
      ipRiskLabel: status.ipRiskLabel,
    },
  });
  cache = null;
  return { ...status, pending: true };
}

async function finishGeneration(text, conversationId) {
  const session = await generation.take(conversationId);
  if (!session) return { ignored: true };
  const replyTokens = estimateTokens(text);
  const reasoningTokens = session.thoughtTokens || 0;
  const outputTokens = replyTokens + reasoningTokens;
  const durationMs = Math.max(1, Date.now() - session.startedAt);
  const firstTokenMs = session.firstTokenAt ? Math.max(0, session.firstTokenAt - session.startedAt) : 0;
  const measured = computeTps(outputTokens, durationMs, firstTokenMs);
  const classified = classifyTps({
    ...measured,
    reasoningTokens,
    requireThinking: session.source === "grok-build",
  });
  const ip = session.ip || {};
  let titleFull = session.titleFull || session.title || "";
  let model = session.model || "";
  if (session.source === "cursor-hook") {
    const meta = readCursorMeta(session.conversationId);
    titleFull = meta.title || titleFull;
    model = model || meta.model || "";
  }
  const sample = buildSample({
    id: session.sampleId || session.id,
    source: session.source,
    titleFull,
    model,
    ipv4: ip.ipv4,
    ipv6: ip.ipv6,
    geo: ip.geo,
    reasoningTokens,
    replyTokens,
    measured,
    classified,
  });
  const patch = { ...sample, pending: false };
  delete patch.at;
  const updated = session.sampleId ? await store.update(session.sampleId, patch) : null;
  if (!updated) await store.add({ ...sample, pending: false });
  cache = null;
  return updated || sample;
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, emptyStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/refresh") {
      cache = null;
      const status = await lookupStatus();
      notifyClients();
      json(res, 200, status);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generation/start") {
      const body = await readBody(req).catch(() => ({}));
      json(res, 200, await startGeneration({ ...body, source: body.source || "cursor-hook" }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generation/thought") {
      const body = await readBody(req).catch(() => ({}));
      json(res, 200, (await generation.thought(body.text || "", body.conversationId || "")) || { ignored: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generation/finish") {
      const body = await readBody(req).catch(() => ({}));
      json(res, 200, await finishGeneration(body.text || "", body.conversationId || ""));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      });
      res.write(":ok\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/samples") {
      json(
        res,
        200,
        store.list().map((s) =>
          presentSample({
            ...s,
            sourceLabel: s.sourceLabel || LABELS.source[s.source] || s.source || "未知",
            levelLabel: s.levelLabel || LABELS.level[s.level] || s.level,
          }),
        ),
      );
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/samples") {
      await store.clear();
      cache = null;
      notifyClients();
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sample") {
      const body = await readBody(req);
      const measured = computeTps(body.outputTokens, body.durationMs, body.firstTokenMs);
      const classified = classifyTps({
        ...measured,
        reasoningTokens: body.reasoningTokens,
        requireThinking: body.source === "grok-build",
      });
      const sample = buildSample({
        source: body.source || "unknown",
        titleFull: body.title || "",
        model: body.model || "",
        ipv4: body.ipv4 || null,
        geo: body.geo || {},
        reasoningTokens: body.reasoningTokens ?? null,
        measured,
        classified,
      });
      await store.add(sample);
      cache = null;
      json(res, 200, sample);
      return;
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(path.join(__dirname, "public", "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET") {
      const types = {
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".png": "image/png",
      };
      const ext = path.extname(url.pathname).toLowerCase();
      const type = types[ext];
      const name = path.basename(url.pathname);
      if (type && name && !name.includes("..")) {
        try {
          const file = await readFile(path.join(__dirname, "public", name));
          res.writeHead(200, {
            "content-type": type,
            "cache-control": "public, max-age=86400",
            "content-length": file.length,
          });
          res.end(file);
          return;
        } catch {
          /* fall through */
        }
      }
    }

    json(res, 404, { error: "not_found" });
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

await store.load();
await generation.load();

const grokSeen = new Set();
startGrokWatch({
  seen: grokSeen,
  async onTurn(turn) {
    const status = await lookupStatus();
    const measured = computeTps(turn.outputTokens, turn.durationMs, turn.firstTokenMs);
    const classified = classifyTps({
      ...measured,
      reasoningTokens: turn.reasoningTokens,
      requireThinking: true,
    });
    await store.add(
      buildSample({
        source: "grok-build",
        titleFull: turn.title || "",
        model: turn.model || "",
        ipv4: status.ipv4,
        geo: status.geo,
        reasoningTokens: turn.reasoningTokens,
        measured,
        classified,
      }),
    );
    cache = null;
  },
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Grok Egress Guard  http://127.0.0.1:${PORT}`);
});
