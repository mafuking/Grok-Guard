import { readStdinJson, post } from "./read-stdin.mjs";

await readStdinJson();
await post("/api/generation/finish", { text: "" });
process.stdout.write("{}");
