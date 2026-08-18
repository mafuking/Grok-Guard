import { readStdinJson, post } from "./read-stdin.mjs";

const input = await readStdinJson();
await post("/api/generation/start", {
  source: "cursor-hook",
  prompt: input.prompt || "",
  title: input.title || input.conversation_title || input.name || "",
  model: input.model || input.model_id || input.modelId || input.composer_model || "",
  conversationId:
    input.conversation_id || input.conversationId || input.composerId || input.composer_id || "",
});
process.stdout.write(JSON.stringify({ continue: true }));
