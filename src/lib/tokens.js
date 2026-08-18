/** Approximate tokens the way a panel would: CJK ≈ 1, other ≈ 4 chars. Not an official tokenizer. */
export function estimateTokens(text) {
  const raw = String(text || "");
  if (!raw) return 0;
  const cjk = (raw.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const rest = raw.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, "");
  return Math.max(0, cjk + Math.round(rest.length / 4));
}
