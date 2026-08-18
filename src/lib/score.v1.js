/** Frozen v1: TPS + IP combined verdict. Rollback with GROK_GUARD_LOGIC=v1 or git checkout v1-tps-ip-verdict. */

export const SOFT_TPS = 200;
export const HARD_TPS = 1000;
export const MIN_GEN_WINDOW_MS = 1000;
export const THINKING_OUTPUT_FLOOR = 32;

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

export function classifyTps({ tps, windowMs, tokens, reasoningTokens, requireThinking }) {
  const reasons = [];

  if (tokens >= THINKING_OUTPUT_FLOOR && !reasoningTokens) {
    reasons.push("thinking_missing");
    if (requireThinking) return { level: "hard", reasons };
  }

  if (windowMs < MIN_GEN_WINDOW_MS && tps >= SOFT_TPS) {
    return { level: "burst", reasons: [...reasons, "buffered_burst"] };
  }
  if (tps >= HARD_TPS) {
    return { level: "hard", reasons: [...reasons, "hard_tps"] };
  }
  if (tps >= SOFT_TPS) {
    return { level: "soft", reasons: [...reasons, "soft_tps"] };
  }
  return { level: "ok", reasons };
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
    soft: "速度有点快，先盯着",
    hard: "速度异常快，可能被降智",
    burst: "回复太短，数字不准",
  },
  reason: {
    datacenter_asn: "机房 IP",
    proxy_flag: "带代理标记",
    mobile: "蜂窝网络",
    looks_isp: "更像家宽",
    thinking_missing: "这个模型没有思考过程",
    buffered_burst: "生成不到 1 秒，速度虚算",
    soft_tps: "超过 200 令牌/秒",
    hard_tps: "超过 1000 令牌/秒",
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
  else if (tpsClass?.level === "soft" || tpsClass?.level === "burst") verdict = "watch";
  else if (ipScore.band === "high") verdict = "ip_risky";
  else if (ipScore.band === "medium") verdict = "watch";

  return {
    verdict,
    verdictLabel: LABELS.verdict[verdict],
    ipRiskLabel: LABELS.band[ipScore.band],
    summary: summarize(verdict, ipScore, tpsClass, ipv4),
    notes,
    noteLabels: notes.map(labelReason),
    ipv4,
    ipv6,
  };
}

function summarize(verdict, ipScore, tpsClass, ipv4) {
  const ip = ipv4 || "未知";
  const tps = tpsClass ? `${tpsClass.tps.toFixed(1)} 令牌/秒` : "暂无样本";
  const risk = LABELS.band[ipScore.band];
  const map = {
    likely_ok: `出口 ${ip} 更像普通宽带，风险${risk}，吞吐 ${tps}，未见社区口径的硬降智信号。`,
    watch: `出口 ${ip} 需关注：IP 风险${risk}，吞吐 ${tps}。`,
    ip_risky: `出口 ${ip} 更像机房或代理。Cursor 官方流量先到 Cursor 再转模型，这个 IP 主要影响地区目录和风控，不能单独证明已经降智。`,
    likely_degraded: `吞吐 ${tps} 达到社区硬阈值（≥${HARD_TPS} 令牌/秒）。这是启发式，不是官方鉴定。`,
  };
  return map[verdict];
}
