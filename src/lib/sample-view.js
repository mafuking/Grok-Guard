import { labelReason } from "./score.js";

const TITLE_WIDTH = 18;
const IP_ONLY = /^(?:\d{1,3}\.){3}\d{1,3}$|^未知 IP$/i;
const SKIP_REMARK = new Set(["机房", "更像宽带", "更像家宽", "机房 IP"]);

const MODEL_RULES = [
  [/gpt-?5\.6-?sol/i, "GPT-5.6 SOL"],
  [/grok-?4\.6/i, "Grok 4.6"],
  [/grok-?4\.5/i, "Grok 4.5"],
  [/composer-?2\.5/i, "Composer 2.5"],
  [/claude-?opus-?5/i, "Claude Opus 5"],
  [/claude-?sonnet-?4[.-]?6/i, "Claude Sonnet 4.6"],
];

export function displayWidth(text) {
  let n = 0;
  for (const ch of String(text || "")) {
    n += /[\u1100-\u115f\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(ch)
      ? 2
      : 1;
  }
  return n;
}

export function abbreviateTitle(text, maxWidth = TITLE_WIDTH) {
  const clean = String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  let width = 0;
  let out = "";
  for (const ch of clean) {
    const w = displayWidth(ch);
    if (width + w > maxWidth) return `${out}…`;
    out += ch;
    width += w;
  }
  return out;
}

export function titleFromPrompt(prompt) {
  let text = String(prompt || "");
  const tagged = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (tagged) text = tagged[1];
  text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text;
}

export function formatModel(id) {
  const raw = String(id || "").trim();
  if (!raw) return "";
  for (const [re, label] of MODEL_RULES) {
    if (re.test(raw)) return label;
  }
  return raw
    .replace(/-build$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function looksLikeModelId(value) {
  const s = String(value || "");
  if (!s) return false;
  if (MODEL_RULES.some(([re]) => re.test(s))) return true;
  return /^(grok|gpt|claude|composer)[-.\s]/i.test(s);
}

export function formatIpCell(ipv4, geo = {}) {
  if (!ipv4) return "—";
  return geo.hosting ? `${ipv4}(机房)` : `${ipv4}(宽带)`;
}

export function leftoverRemarks(sample) {
  const out = [];
  if (sample.reasoningTokens != null && sample.kind !== "ip") {
    out.push(`思考 ${sample.reasoningTokens}`);
  }
  const labels = sample.reasonLabels || (sample.reasons || []).map(labelReason);
  const model = sample.model || "";
  const modelLabel = sample.modelLabel || formatModel(model);
  for (const item of labels) {
    const text = String(item || "").trim();
    if (!text) continue;
    if (IP_ONLY.test(text)) continue;
    if (SKIP_REMARK.has(text)) continue;
    if (text === model || text === modelLabel) continue;
    if (looksLikeModelId(text)) continue;
    if (/^思考\s/.test(text)) continue;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

export function presentSample(sample) {
  const titleFull = sample.titleFull || sample.title || "";
  const title = sample.title || abbreviateTitle(titleFull) || "—";
  const modelLabel = sample.modelLabel || formatModel(sample.model) || "—";
  return {
    ...sample,
    title,
    titleFull,
    modelLabel,
    ipLabel: sample.ipLabel || formatIpCell(sample.ipv4, sample.geo || {}),
    remarkLabels: sample.pending ? [] : leftoverRemarks({ ...sample, modelLabel }),
  };
}
