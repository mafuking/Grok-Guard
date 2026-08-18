// ==UserScript==
// @name         Grok Egress Guard
// @namespace    local.grok-egress-guard
// @version      1.2.0
// @description  On Grok Build send: check local egress IP; after stream, report usage and tok/s
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

  function readInitBody(init) {
    const body = init?.body;
    return typeof body === "string" ? body : "";
  }

  function lastNumber(text, re) {
    let last = null;
    const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let match;
    while ((match = copy.exec(text))) last = Number(match[1]);
    return Number.isFinite(last) ? last : null;
  }

  function extractUsage(text) {
    const reasoningTokens = lastNumber(
      text,
      /"reasoning(?:_tokens|Tokens|TokenCount)"\s*:\s*(\d+)/,
    );
    const outputTokens = lastNumber(
      text,
      /"(?:output_tokens|outputTokens|completion_tokens)"\s*:\s*(\d+)/,
    );
    return {
      reasoningTokens,
      outputTokens,
      reasoningKnown: reasoningTokens != null,
    };
  }

  function maybeReport(url, started, firstAt, text, requestText) {
    if (!WATCH.test(String(url))) return;
    if (!text || text.length < 16) return;
    const usage = extractUsage(text);
    const ended = Date.now();
    post(SAMPLE, {
      source: "grok-build",
      outputTokens: usage.outputTokens ?? estimateTokens(text),
      durationMs: ended - started,
      firstTokenMs: firstAt ? firstAt - started : 0,
      reasoningTokens: usage.reasoningTokens,
      reasoningKnown: usage.reasoningKnown,
      probe: /QUALITY_OK/.test(requestText) && /TCP/i.test(requestText),
      marker: /QUALITY_OK/.test(text) ? "QUALITY_OK" : null,
    });
  }

  const rawFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init?.method || input?.method || "GET").toUpperCase();
    const requestText = method === "POST" && WATCH.test(url) ? readInitBody(init) : "";
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
          maybeReport(url, started, firstAt, text, requestText);
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
