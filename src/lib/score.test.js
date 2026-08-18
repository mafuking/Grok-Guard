import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTpsV2,
  combineVerdictV2,
  expectsThinking,
  isProbeText,
  computeTps,
} from "./score.js";
import { classifyTps as classifyTpsV1, combineVerdict as combineVerdictV1 } from "./score.v1.js";

test("Grok missing thinking is hard when reasoning is known zero", () => {
  const got = classifyTpsV2({
    tps: 80,
    windowMs: 5000,
    tokens: 200,
    reasoningTokens: 0,
    reasoningKnown: true,
    requireThinking: true,
  });
  assert.equal(got.level, "hard");
  assert.deepEqual(got.reasons, ["thinking_missing"]);
});

test("unknown reasoning does not hard-fail Grok", () => {
  const got = classifyTpsV2({
    tps: 80,
    windowMs: 5000,
    tokens: 200,
    reasoningTokens: undefined,
    reasoningKnown: false,
    requireThinking: true,
  });
  assert.equal(got.level, "ok");
  assert.ok(got.reasons.includes("thinking_unknown"));
});

test("high TPS with thinking stays ok", () => {
  const got = classifyTpsV2({
    tps: 451,
    windowMs: 1429,
    tokens: 645,
    reasoningTokens: 486,
    reasoningKnown: true,
    requireThinking: true,
  });
  assert.equal(got.level, "ok");
  assert.ok(got.reasons.includes("soft_tps"));
});

test("burst does not become likely_degraded or watch", () => {
  const classified = classifyTpsV2({
    tps: 840,
    windowMs: 400,
    tokens: 80,
    reasoningTokens: 40,
    reasoningKnown: true,
    requireThinking: true,
  });
  assert.equal(classified.level, "burst");
  const combined = combineVerdictV2({
    ipScore: { band: "medium", risk: 45, reasons: ["datacenter_asn"] },
    tpsClass: { ...classified, tps: 840 },
    ipv4: "23.95.226.14",
  });
  assert.equal(combined.verdict, "likely_ok");
});

test("probe without QUALITY_OK is hard", () => {
  const got = classifyTpsV2({
    tps: 40,
    windowMs: 4000,
    tokens: 90,
    reasoningTokens: 20,
    reasoningKnown: true,
    requireThinking: true,
    probe: true,
    marker: null,
  });
  assert.equal(got.level, "hard");
  assert.deepEqual(got.reasons, ["probe_failed"]);
});

test("v1 still treats hard TPS as degraded", () => {
  const classified = classifyTpsV1({
    tps: 1200,
    windowMs: 2000,
    tokens: 400,
    reasoningTokens: 100,
    requireThinking: false,
  });
  assert.equal(classified.level, "hard");
  const combined = combineVerdictV1({
    ipScore: { band: "low", risk: 0, reasons: ["looks_isp"] },
    tpsClass: { ...classified, tps: 1200 },
    ipv4: "1.1.1.1",
  });
  assert.equal(combined.verdict, "likely_degraded");
});

test("expectsThinking is Grok-only", () => {
  assert.equal(expectsThinking("cursor-grok-4.6-xhigh-fast", "cursor-hook"), true);
  assert.equal(expectsThinking("gpt-5.6-sol-high", "cursor-hook"), false);
  assert.equal(expectsThinking("", "grok-build"), true);
  assert.equal(isProbeText("最后单独一行只写：QUALITY_OK，并解释 TCP"), true);
  assert.equal(isProbeText("hello"), false);
});

test("TPS formula unchanged", () => {
  const got = computeTps(200, 3000, 1000);
  assert.equal(got.windowMs, 2000);
  assert.equal(got.tps, 100);
});
