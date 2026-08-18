import { readStdinJson, post } from "./read-stdin.mjs";

const input = await readStdinJson();
await post("/api/generation/finish", {
  text: input.text || "",
  conversationId:
    input.conversation_id || input.conversationId || input.composerId || input.composer_id || "",
});
process.stdout.write("{}");
