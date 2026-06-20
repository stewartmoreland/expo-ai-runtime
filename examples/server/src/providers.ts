/**
 * Optional real-provider passthrough. Activated only when an API key is present
 * in the environment; otherwise the server stays in mock mode. Streaming is
 * handled server-side by chunking the final text, so no provider-specific SSE
 * parsing is required here.
 */

import type { GenerateBody, GenerateOutput } from "./mock.js";

export type Mode = "mock" | "openai" | "anthropic";

export function resolveMode(): Mode {
  if (process.env.EXPO_AI_FORCE_MOCK === "1") return "mock";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function userContent(body: GenerateBody): string {
  if (body.schema) {
    return `${body.prompt}\n\nRespond with ONLY a JSON value matching this schema:\n${JSON.stringify(body.schema)}`;
  }
  return body.prompt;
}

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export async function openaiGenerate(body: GenerateBody): Promise<GenerateOutput> {
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(body.instructions ? [{ role: "system", content: body.instructions }] : []),
        { role: "user", content: userContent(body) },
      ],
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.maxOutputTokens !== undefined ? { max_tokens: body.maxOutputTokens } : {}),
      ...(body.schema ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await safeText(res));
  const data = (await res.json()) as OpenAIResponse;
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    finishReason: "stop",
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function anthropicGenerate(body: GenerateBody): Promise<GenerateOutput> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: body.maxOutputTokens ?? 1024,
      ...(body.instructions ? { system: body.instructions } : {}),
      messages: [{ role: "user", content: userContent(body) }],
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await safeText(res));
  const data = (await res.json()) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  return {
    text,
    finishReason: "stop",
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}
