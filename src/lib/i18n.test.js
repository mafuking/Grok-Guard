import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLang, labelsFor, probeFor } from "./i18n.js";
import { combineVerdict } from "./score.js";

test("resolveLang treats Chinese locales as zh", () => {
  assert.equal(resolveLang("zh-CN"), "zh");
  assert.equal(resolveLang("zh-TW,zh;q=0.9"), "zh");
  assert.equal(resolveLang("en-US"), "en");
  assert.equal(resolveLang("fr-FR"), "en");
  assert.equal(resolveLang(""), "zh");
});

test("English labels for a clean datacenter sample stay likely_ok", () => {
  const combined = combineVerdict({
    ipScore: { band: "medium", risk: 45, reasons: ["datacenter_asn"] },
    tpsClass: { level: "ok", reasons: [], tps: 40 },
    ipv4: "23.95.226.14",
    lang: "en",
  });
  assert.equal(combined.verdict, "likely_ok");
  assert.equal(combined.verdictLabel, "Looks fine");
  assert.match(combined.summary, /Egress 23.95.226.14/);
});

test("English probe still contains QUALITY_OK and TCP", () => {
  const prompt = probeFor("en");
  assert.match(prompt, /QUALITY_OK/);
  assert.match(prompt, /TCP/);
  assert.equal(labelsFor("en").reason.probe_failed.includes("QUALITY_OK"), true);
});
