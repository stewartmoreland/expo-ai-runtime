// Manual integration smoke test: drives the real cloud adapter against a
// running reference server. Usage: node examples/server/scripts/smoke.mjs
import { ExpoAI, clearAdapters } from "@stewmore/expo-ai-core";
import { configureCloud } from "@stewmore/expo-ai-cloud";

const endpoint = process.env.ENDPOINT ?? "http://localhost:8787";
clearAdapters();
configureCloud({ endpoint });

const gen = await ExpoAI.generate({ prompt: "Hello there", provider: "cloud" });
console.log("GENERATE:", gen.provider, "|", gen.privacy.privacyMode, "|", JSON.stringify(gen.text).slice(0, 80));

const obj = await ExpoAI.generateObject({
  prompt: "Extract a person",
  provider: "cloud",
  schema: {
    type: "object",
    properties: { name: { type: "string" }, age: { type: "integer" } },
    required: ["name", "age"],
  },
});
console.log("OBJECT:", JSON.stringify(obj));

let streamed = "";
let deltas = 0;
for await (const chunk of ExpoAI.stream({ prompt: "Stream a few words please", provider: "cloud" })) {
  if (chunk.type === "delta") {
    streamed += chunk.text;
    deltas += 1;
  } else if (chunk.type === "done") {
    console.log("STREAM done text:", JSON.stringify(chunk.result.text).slice(0, 60), "| deltas:", deltas);
  }
}
console.log("STREAM assembled length:", streamed.length, streamed.length > 0 ? "OK" : "EMPTY");
