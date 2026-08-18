export function resolveLang(input) {
  const raw = String(input || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (raw.startsWith("zh")) return "zh";
  if (raw === "en" || raw.startsWith("en-")) return "en";
  return raw ? "en" : "zh";
}

export function detectBrowserLang() {
  try {
    const saved = localStorage.getItem("grok-guard-lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language || navigator.userLanguage : "";
  return resolveLang(nav || "zh");
}

export function labelsFor(lang) {
  return lang === "en" ? LABELS_EN : LABELS_ZH;
}

export function probeFor(lang) {
  return lang === "en"
    ? "In about 80 to 120 English words, explain the difference between TCP and UDP. Do not use a list. On the last line write only: QUALITY_OK"
    : "用大约 80 到 120 个英文词解释 TCP 和 UDP 的区别，不要列清单。最后单独一行只写：QUALITY_OK";
}

export function uiFor(lang) {
  return lang === "en" ? UI_EN : UI_ZH;
}

export function labelReason(code, lang = "zh") {
  const labels = labelsFor(lang);
  if (labels.reason[code]) return labels.reason[code];
  if (String(code).startsWith("region_")) {
    const region = String(code).slice(7);
    return lang === "en" ? `Region ${region}` : `地区 ${region}`;
  }
  return code;
}

export function summarizeVerdict(verdict, ipScore, tpsClass, ipv4, lang = "zh") {
  const labels = labelsFor(lang);
  const unknownIp = lang === "en" ? "unknown" : "未知";
  const noSample = lang === "en" ? "no sample yet" : "暂无样本";
  const noQuality = lang === "en" ? "no missing-thinking or probe failure" : "未见缺思考或探针失败";
  const ip = ipv4 || unknownIp;
  const tps =
    tpsClass && tpsClass.tps != null
      ? lang === "en"
        ? `${tpsClass.tps.toFixed(1)} tok/s`
        : `${tpsClass.tps.toFixed(1)} 令牌/秒`
      : noSample;
  const risk = labels.band[ipScore.band];
  const quality = (tpsClass?.reasons || []).map((code) => labelReason(code, lang)).filter(Boolean).join(lang === "en" ? ", " : "，") || noQuality;
  if (lang === "en") {
    return {
      likely_ok: `No hard quality signal (${quality}). Egress ${ip}, risk ${risk}. Throughput ${tps} is recorded only; official high speed is not degradation.`,
      watch: `Quality needs attention: ${quality}. Egress ${ip}, risk ${risk}, throughput ${tps}.`,
      ip_risky: `Egress ${ip} looks like a datacenter or proxy (risk ${risk}). No hard quality signal. This IP mainly affects region catalogs and risk controls.`,
      likely_degraded: `Hard quality signal: ${quality}. Throughput ${tps} is secondary. Community heuristic, not an official verdict.`,
    }[verdict];
  }
  return {
    likely_ok: `模型侧未见硬降智信号（${quality}）。出口 ${ip}，风险${risk}。吞吐 ${tps} 只作记录，官方高速不算降智。`,
    watch: `模型侧需关注：${quality}。出口 ${ip}，风险${risk}，吞吐 ${tps}。`,
    ip_risky: `出口 ${ip} 更像机房或代理（风险${risk}）。模型侧未见硬降智信号。这个 IP 主要影响地区目录和风控。`,
    likely_degraded: `模型侧出现硬信号：${quality}。吞吐 ${tps} 只作辅证。这是启发式，不是官方鉴定。`,
  }[verdict];
}

const LABELS_ZH = {
  verdict: {
    likely_ok: "看起来正常",
    watch: "需关注",
    ip_risky: "出口偏脏",
    likely_degraded: "疑似降智",
    unchecked: "尚未检测",
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

const LABELS_EN = {
  verdict: {
    likely_ok: "Looks fine",
    watch: "Watch",
    ip_risky: "Dirty egress",
    likely_degraded: "Likely degraded",
    unchecked: "Not checked yet",
  },
  band: { low: "low", medium: "medium", high: "high" },
  level: {
    ok: "Looks fine",
    soft: "Fast; recorded only",
    hard: "Likely degraded",
    burst: "Burst; recorded only",
  },
  reason: {
    datacenter_asn: "Datacenter IP",
    proxy_flag: "Proxy flag",
    mobile: "Mobile network",
    looks_isp: "Looks residential",
    thinking_missing: "No thinking",
    thinking_unknown: "Thinking not captured",
    buffered_burst: "Sub-1s window, inflated speed",
    soft_tps: "Over 200 tok/s (recorded only)",
    hard_tps: "Over 1000 tok/s (recorded only)",
    probe_failed: "Probe missed QUALITY_OK",
    probe_ok: "Probe passed",
    ipv4_ipv6_mismatch: "IPv4/IPv6 mismatch",
  },
  source: {
    "grok-build": "Grok Build",
    "cursor-hook": "Cursor",
    manual: "Manual check",
    "manual-test": "Manual test",
    unknown: "Unknown",
  },
};

const UI_ZH = {
  title: "Grok 出口检测",
  lead: "官方订阅检测：Grok 看有没有思考 / 探针是否通过；出口 IP 只判断机房和地区，令牌/秒只作记录。",
  refresh: "重新检测出口",
  refreshing: "检测中…",
  refreshed: "已更新",
  refreshFail: "失败，再试",
  copyProbe: "复制质量探针",
  copied: "已复制",
  copyFail: "复制失败",
  egress: "当前出口",
  checking: "检测中…",
  loc: "地点",
  isp: "运营商",
  asn: "网络",
  unknown: "未知",
  riskPrefix: "风险",
  hosting: "机房",
  proxy: "代理标记",
  residential: "更像宽带",
  scope: "适用边界",
  scopeQuality: "模型质量",
  scopeQualityBody: "：Grok 确认没有思考，或探针缺 QUALITY_OK，才标疑似降智。SOL 等无思考模型只备注。",
  scopeEgress: "出口",
  scopeEgressBody: "：机房 / 代理 / 国家单独看，不和降智合成。Cursor 官方流量先到 Cursor，本机 IP 管地区和风控。",
  logicVersion: "判定版本",
  samples: "最近样本",
  unchecked: "尚未检测",
  lastCheck: "上次检测：",
  timingOne: "正在计时，出结果后自动更新",
  timingMany: " 条正在计时，出结果后自动更新",
  clear: "清空样本",
  clearConfirm1: "确定清空全部样本？",
  clearConfirm2: "再确认一次：会从磁盘删掉 samples.json 里的记录，不能恢复。",
  clearFail: "清空失败：",
  detectFail: "检测失败：",
  offline: "服务未就绪",
  colTime: "时间",
  colTitle: "对话",
  colSource: "来源",
  colModel: "模型",
  colIp: "IP",
  colTps: "令牌/秒",
  colLevel: "判定",
  colRemark: "备注",
  empty: "还没有记录。发送 Cursor / Grok Build 对话，或点重新检测。",
  emptyShort: "还没有记录。",
  page: "第 {page}/{pages} 页 · 共 {total} 条",
  none: "共 0 条",
  prev: "上一页",
  next: "下一页",
  thinking: "思考",
  dc: "机房",
  ispShort: "宽带",
  pendingTps: "正在计时",
  langBtn: "EN",
  langTitle: "Switch to English",
};

const UI_EN = {
  title: "Grok egress check",
  lead: "Official-login check: for Grok, look at thinking and the probe; egress IP is datacenter/region only; tok/s is recorded, not a verdict.",
  refresh: "Recheck egress",
  refreshing: "Checking…",
  refreshed: "Updated",
  refreshFail: "Failed, retry",
  copyProbe: "Copy quality probe",
  copied: "Copied",
  copyFail: "Copy failed",
  egress: "Current egress",
  checking: "Checking…",
  loc: "Location",
  isp: "ISP",
  asn: "Network",
  unknown: "Unknown",
  riskPrefix: "Risk ",
  hosting: "Datacenter",
  proxy: "Proxy flag",
  residential: "Looks residential",
  scope: "Scope",
  scopeQuality: "Quality",
  scopeQualityBody: ": Grok is marked degraded only if thinking is confirmed missing, or the probe lacks QUALITY_OK. Models without thinking (SOL, etc.) are notes only.",
  scopeEgress: "Egress",
  scopeEgressBody: ": datacenter / proxy / country stay separate from quality. Official Cursor traffic hits Cursor first; this IP is for region catalogs and risk controls.",
  logicVersion: "Logic version",
  samples: "Recent samples",
  unchecked: "Not checked yet",
  lastCheck: "Last check: ",
  timingOne: "Timing; updates when the reply finishes",
  timingMany: " samples timing; updates when replies finish",
  clear: "Clear samples",
  clearConfirm1: "Clear all samples?",
  clearConfirm2: "This deletes data/samples.json on disk and cannot be undone.",
  clearFail: "Clear failed: ",
  detectFail: "Check failed: ",
  offline: "Service is not ready",
  colTime: "Time",
  colTitle: "Chat",
  colSource: "Source",
  colModel: "Model",
  colIp: "IP",
  colTps: "Tok/s",
  colLevel: "Verdict",
  colRemark: "Notes",
  empty: "No samples yet. Send a Cursor or Grok Build chat, or recheck egress.",
  emptyShort: "No samples yet.",
  page: "Page {page}/{pages} · {total} total",
  none: "0 samples",
  prev: "Prev",
  next: "Next",
  thinking: "Think",
  dc: "DC",
  ispShort: "ISP",
  pendingTps: "Timing",
  langBtn: "中文",
  langTitle: "切换到中文",
};
