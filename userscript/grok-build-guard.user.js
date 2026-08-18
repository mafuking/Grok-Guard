// ==UserScript==
// @name         Grok Egress Guard
// @namespace    local.grok-egress-guard
// @version      1.1.0
// @description  On Grok Build send: check local egress IP; after stream, report estimated tok/s
// @match        https://grok.com/*
// @match        https://*.grok.com/*
// @match        https://x.com/*
// @connect      127.0.0.1
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(() => {
  const REFRESH = "http://127.0.0.1:3780/api/refresh";
  const SAMPLE = "http://127.0.0.1:3780/api/sample";
  const WATCH = /grok\.com|api\.x\.ai|x\.ai/i;
  let lastPing = 0;

  function post(url, payload) {
    const body = JSON.stringify(payload);
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "POST",
        url,
        data: body,
        headers: { "Content-Type": "application/json" },
      });
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }

  function pingIp() {
    if (Date.now() - lastPing < 2000) return;
    lastPing = Date.now();
    post(REFRESH, { source: "grok-build" });
  }

  function estimateTokens(text) {
    if (!text) return 0;
    return Math.max(1, Math.round(text.length / 4));
  }

  function maybeReport(url, started, firstAt, text) {
    if (!WATCH.test(String(url))) return;
    if (!text || text.length < 16) return;
    const ended = Date.now();
    post(SAMPLE, {
      source: "grok-build",
      outputTokens: estimateTokens(text),
      durationMs: ended - started,
      firstTokenMs: firstAt ? firstAt - started : 0,
      marker: /QUALITY_OK/.test(text) ? "QUALITY_OK" : null,
    });
  }

  const rawFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init?.method || input?.method || "GET").toUpperCase();
    if (method === "POST" && WATCH.test(url)) pingIp();
    const started = Date.now();
    const res = await rawFetch(input, init);
    if (!WATCH.test(url) || !res.body) return res;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let firstAt = 0;
    let text = "";
    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          maybeReport(url, started, firstAt, text);
          controller.close();
          return;
        }
        if (!firstAt) firstAt = Date.now();
        text += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      },
    });
    return new Response(stream, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };
})();
