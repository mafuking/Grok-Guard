/** Community heuristic. Not an official xAI / Cursor verdict. */

export const LOGIC_VERSION = "v2.0.0";
export const SOFT_TPS = 200;
export const HARD_TPS = 1000;
export const MIN_GEN_WINDOW_MS = 1000;
export const THINKING_OUTPUT_FLOOR = 32;
export const QUALITY_PROBE =
  "用大约 80 到 120 个英文词解释 TCP 和 UDP 的区别，不要列清单。最后单独一行只写：QUALITY_OK";

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

export const LABELS = {
  verdict: {
    likely_ok: "看起来正常",
    watch: "需关注",
    ip_risky: "出口偏脏",
    likely_degraded: "疑似降智",
  },
  band: { low: "低", medium: "中等", high: "高" },
  level: {
    ok: "看起来正常",
    soft: "速度偏快，仅记录",
    hard: "疑似降智",
    burst: "速度虚算，仅记录",
  },
  reason: {
    datacenter_asn: "机房 IP",
    proxy_flag: "带代理标记",
    mobile: "蜂窝网络",
    looks_isp: "更像家宽",
    thinking_missing: "没有思考过程",
    thinking_unknown: "没采到思考数据",
    buffered_burst: "生成不到 1 秒，速度虚算",
    soft_tps: "超过 200 令牌/秒（仅记录）",
    hard_tps: "超过 1000 令牌/秒（仅记录）",
    probe_failed: "探针没出现 QUALITY_OK",
    probe_ok: "探针通过",
    ipv4_ipv6_mismatch: "IPv4/IPv6 出口不一致",
  },
  source: {
    "grok-build": "Grok Build",
    "cursor-hook": "Cursor 发送",
    manual: "手动检测",
    "manual-test": "手动测试",
    unknown: "未知",
  },
};

export function labelReason(code) {
  if (LABELS.reason[code]) return LABELS.reason[code];
  if (String(code).startsWith("region_")) return `地区 ${String(code).slice(7)}`;
  return code;
}

export function combineVerdict({ ipScore, tpsClass, ipv4, ipv6, ipv6Leak }) {
  const notes = [];
  if (ipv6Leak) notes.push("ipv4_ipv6_mismatch");

  let verdict = "likely_ok";
  if (tpsClass?.level === "hard") verdict = "likely_degraded";
  else if (ipScore.band === "high") verdict = "ip_risky";

  return {
    verdict,
    verdictLabel: LABELS.verdict[verdict],
    ipRiskLabel: LABELS.band[ipScore.band],
    logicVersion: LOGIC_VERSION,
    summary: summarize(verdict, ipScore, tpsClass, ipv4),
    notes,
    noteLabels: notes.map(labelReason),
    ipv4,
    ipv6,
  };
}

function summarize(verdict, ipScore, tpsClass, ipv4) {
  const ip = ipv4 || "未知";
  const tps = tpsClass && tpsClass.tps != null ? `${tpsClass.tps.toFixed(1)} 令牌/秒` : "暂无样本";
  const risk = LABELS.band[ipScore.band];
  const quality = (tpsClass?.reasons || []).map(labelReason).filter(Boolean).join("，") || "未见缺思考或探针失败";
  const map = {
    likely_ok: `模型侧未见硬降智信号（${quality}）。出口 ${ip}，风险${risk}。吞吐 ${tps} 只作记录，官方高速不算降智。`,
    watch: `模型侧需关注：${quality}。出口 ${ip}，风险${risk}，吞吐 ${tps}。`,
    ip_risky: `出口 ${ip} 更像机房或代理（风险${risk}）。模型侧未见硬降智信号。这个 IP 主要影响地区目录和风控。`,
    likely_degraded: `模型侧出现硬信号：${quality}。吞吐 ${tps} 只作辅证。这是启发式，不是官方鉴定。`,
  };
  return map[verdict];
}
