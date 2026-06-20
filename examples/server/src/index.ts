/**
 * Expo AI Runtime reference cloud backend.
 *
 * Implements the wire protocol the cloud adapter speaks:
 *   GET  /health        -> { ok, mode }
 *   POST /v1/generate   -> { text, finishReason, usage }
 *   POST /v1/stream     -> SSE: data: {"type":"delta",...} … data: [DONE]
 *
 * Mock-by-default (no API keys). Set OPENAI_API_KEY or ANTHROPIC_API_KEY to
 * proxy a real model. Force mock with EXPO_AI_FORCE_MOCK=1.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";

import { mockGenerate, type GenerateBody, type GenerateOutput } from "./mock.js";
import { HttpError, anthropicGenerate, openaiGenerate, resolveMode } from "./providers.js";

const app = new Hono();
app.use("*", cors());

async function generate(body: GenerateBody): Promise<GenerateOutput> {
  const mode = resolveMode();
  if (mode === "openai") return openaiGenerate(body);
  if (mode === "anthropic") return anthropicGenerate(body);
  return mockGenerate(body);
}

app.get("/health", (c) => c.json({ ok: true, mode: resolveMode() }));

app.post("/v1/generate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as GenerateBody;
  if (!body.prompt) {
    return c.json({ code: "INVALID_PROMPT", provider: "cloud", message: "prompt is required" }, 400);
  }
  try {
    return c.json(await generate(body));
  } catch (error) {
    const { body: errBody, status } = errorPayload(error);
    return c.json(errBody, status);
  }
});

app.post("/v1/stream", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as GenerateBody;
  if (!body.prompt) {
    return c.json({ code: "INVALID_PROMPT", provider: "cloud", message: "prompt is required" }, 400);
  }

  let output: GenerateOutput;
  try {
    output = await generate(body);
  } catch (error) {
    const { body: errBody, status } = errorPayload(error);
    return c.json(errBody, status);
  }

  return streamSSE(c, async (stream) => {
    const tokens = output.text.split(/(\s+)/).filter((token) => token.length > 0);
    for (const token of tokens) {
      await stream.writeSSE({ data: JSON.stringify({ type: "delta", text: token }) });
      await stream.sleep(15);
    }
    await stream.writeSSE({
      data: JSON.stringify({ type: "done", text: output.text, finishReason: output.finishReason }),
    });
    await stream.writeSSE({ data: "[DONE]" });
  });
});

function errorPayload(error: unknown): {
  body: { code: string; provider: string; message: string };
  status: 429 | 502;
} {
  const status: 429 | 502 = error instanceof HttpError && error.status === 429 ? 429 : 502;
  const code = status === 429 ? "RATE_LIMITED" : "NATIVE_PROVIDER_ERROR";
  const message = error instanceof Error ? error.message : "upstream error";
  return { body: { code, provider: "cloud", message }, status };
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `Expo AI Runtime reference server (${resolveMode()} mode) → http://localhost:${info.port}`,
  );
});
