/** Community heuristic. Not an official xAI / Cursor verdict. */

import { labelReason as labelReasonLang, labelsFor, probeFor, summarizeVerdict } from "./i18n.js";

export const LOGIC_VERSION = "v2.0.0";
export const SOFT_TPS = 200;
export const HARD_TPS = 1000;
export const MIN_GEN_WINDOW_MS = 1000;
export const THINKING_OUTPUT_FLOOR = 32;
export const QUALITY_PROBE = probeFor("zh");
export const LABELS = labelsFor("zh");

export function logicVersion() {
  return LOGIC_VERSION;
}

export function computeTps(outputTokens, durationMs, firstTokenMs) {
  const tokens = Number(outputTokens) || 0;
  const duration = Number(durationMs) || 0;
  const ttft = Math.max(0, Number(firstTokenMs) || 0);
  const windowMs = Math.max(1, duration - ttft);
  return {
    tps: (tokens * 1000) / windowMs,
    windowMs,
    tokens,
    durationMs: duration,
    firstTokenMs: ttft,
  };
}

export function scoreIp(info) {
  const reasons = [];
  let risk = 0;

  if (info.hosting) {
    risk += 45;
    reasons.push("datacenter_asn");
  }
  if (info.proxy) {
    risk += 25;
    reasons.push("proxy_flag");
  }
  if (info.mobile) {
    risk += 10;
    reasons.push("mobile");
  }
  if (info.countryCode && info.countryCode !== "US") {
    risk += 15;
    reasons.push(`region_${info.countryCode}`);
  }
  if (!info.hosting && !info.proxy) {
    reasons.push("looks_isp");
  }

  risk = Math.min(100, risk);
  let band = "low";
  if (risk >= 60) band = "high";
  else if (risk >= 30) band = "medium";

  return { risk, band, reasons };
}

export function expectsThinking(model = "", source = "") {
  if (source === "grok-build") return true;
  return /grok/i.test(String(model || ""));
}

export function isProbeText(text) {
  const raw = String(text || "");
  return raw.includes("QUALITY_OK") && /TCP/i.test(raw);
}

export function classifyTps({
  tps,
  windowMs,
  tokens,
  reasoningTokens,
  reasoningKnown,
  requireThinking,
  probe,
  marker,
}) {
  const reasons = [];
  const known = reasoningKnown === true;
  const reasoning = Number(reasoningTokens) || 0;

  if (probe && marker !== "QUALITY_OK") {
    return { level: "hard", reasons: ["probe_failed"] };
  }
  if (probe && marker === "QUALITY_OK") reasons.push("probe_ok");

  if (tokens >= THINKING_OUTPUT_FLOOR) {
    if (!known) {
      reasons.push(requireThinking ? "thinking_unknown" : "thinking_missing");
    } else if (!reasoning) {
      reasons.push("thinking_missing");
      if (requireThinking) return { level: "hard", reasons };
    }
  }

  if (windowMs < MIN_GEN_WINDOW_MS && tps >= SOFT_TPS) {
    return { level: "burst", reasons: [...reasons, "buffered_burst"] };
  }
  if (tps >= HARD_TPS) {
    return { level: "ok", reasons: [...reasons, "hard_tps"] };
  }
  if (tps >= SOFT_TPS) {
    return { level: "ok", reasons: [...reasons, "soft_tps"] };
  }
  return { level: "ok", reasons };
}

export function labelReason(code, lang = "zh") {
  return labelReasonLang(code, lang);
}

export function combineVerdict({ ipScore, tpsClass, ipv4, ipv6, ipv6Leak, lang = "zh" }) {
  const labels = labelsFor(lang);
  const notes = [];
  if (ipv6Leak) notes.push("ipv4_ipv6_mismatch");

  let verdict = "likely_ok";
  if (tpsClass?.level === "hard") verdict = "likely_degraded";
  else if (ipScore.band === "high") verdict = "ip_risky";

  return {
    verdict,
    verdictLabel: labels.verdict[verdict],
    ipRiskLabel: labels.band[ipScore.band],
    logicVersion: LOGIC_VERSION,
    summary: summarizeVerdict(verdict, ipScore, tpsClass, ipv4, lang),
    notes,
    noteLabels: notes.map((code) => labelReason(code, lang)),
    ipv4,
    ipv6,
  };
}
