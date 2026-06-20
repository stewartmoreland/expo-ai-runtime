/**
 * Cloud fallback adapter (docs/prd.md §13).
 *
 * A thin client that POSTs to a configurable backend. The wire protocol is the
 * one served by `examples/server`:
 *
 *   POST {generatePath}  -> { text, finishReason?, usage? }
 *   POST {streamPath}    -> SSE: `data: {"type":"delta","text":"…"}` … `data: [DONE]`
 *
 * Streaming uses the standard `fetch` + `ReadableStream` API; pass `fetch` from
 * `expo/fetch` in a React Native app for streamed response bodies. Defaults to
 * `globalThis.fetch` (Node 18+, browsers).
 */

import { ExpoAIError, isExpoAIErrorCode } from "@stewmore/expo-ai-core";
import type {
  AdapterGenerateResult,
  AdapterStreamHandlers,
  ExpoAIAdapter,
  ExpoAIAvailability,
  ExpoAICapabilities,
  ExpoAIErrorPayload,
  NormalizedGenerateRequest,
  NormalizedObjectRequest,
  StreamHandle,
} from "@stewmore/expo-ai-core";

export type CloudProviderKind = "openai" | "gemini" | "anthropic" | "bedrock" | "custom";

export type CloudProviderConfig = {
  /** Base URL of the backend, e.g. "http://localhost:8787". */
  endpoint: string;
  headers?: Record<string, string>;
  /** Informational hint about which upstream the backend proxies. */
  provider?: CloudProviderKind;
  /** Custom fetch (e.g. from `expo/fetch`). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Path for one-shot generation. Defaults to "/v1/generate". */
  generatePath?: string;
  /** Path for streamed generation (SSE). Defaults to "/v1/stream". */
  streamPath?: string;
};

const PROVIDER = "cloud" as const;

function cloudCapabilities(available: boolean): ExpoAICapabilities {
  return {
    available,
    provider: PROVIDER,
    isOnDevice: false,
    isSystemManagedModel: false,
    sendsPromptOffDevice: true,
    supportsTextGeneration: true,
    supportsStreaming: true,
    supportsSessions: false,
    supportsStructuredOutput: true,
    supportsTools: false,
    supportsImageInput: false,
    supportsSpeechInput: false,
    supportsSummarization: true,
    supportsRewrite: true,
    supportsProofreading: true,
    supportsBringYourOwnModel: false,
    supportsModelDownload: false,
    ...(available ? {} : { reasonUnavailable: "provider_not_configured" as const }),
  };
}

type WirePayload = {
  prompt: string;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  schema?: unknown;
  schemaName?: string;
};

export class CloudAdapter implements ExpoAIAdapter {
  readonly provider = PROVIDER;
  private readonly fetchImpl: typeof fetch;
  private readonly generatePath: string;
  private readonly streamPath: string;

  constructor(private readonly config: CloudProviderConfig) {
    const f = config.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new Error(
        "expo-ai-cloud: no fetch implementation available. Pass `fetch` from expo/fetch.",
      );
    }
    // Bind to globalThis so the platform `fetch` is never invoked with `this`
    // set to this adapter — browsers throw "Illegal invocation" otherwise.
    // Harmless for a custom fetch (e.g. expo/fetch), which ignores `this`.
    this.fetchImpl = f.bind(globalThis);
    this.generatePath = config.generatePath ?? "/v1/generate";
    this.streamPath = config.streamPath ?? "/v1/stream";
  }

  async getAvailability(): Promise<ExpoAIAvailability> {
    if (!this.config.endpoint) {
      return { available: false, provider: PROVIDER, reasonUnavailable: "provider_not_configured" };
    }
    return { available: true, provider: PROVIDER };
  }

  async getCapabilities(): Promise<ExpoAICapabilities> {
    return cloudCapabilities(Boolean(this.config.endpoint));
  }

  async generate(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult> {
    return this.postGenerate(this.payload(req), req.signal);
  }

  async generateObject(req: NormalizedObjectRequest): Promise<AdapterGenerateResult> {
    const payload = this.payload(req);
    payload.schema = req.schema;
    if (req.schemaName !== undefined) payload.schemaName = req.schemaName;
    return this.postGenerate(payload, req.signal);
  }

  stream(req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers): StreamHandle {
    const controller = new AbortController();
    // Honor an externally supplied AbortSignal (direct adapter callers; the core
    // router instead drives cancellation through the returned handle).
    if (req.signal) {
      if (req.signal.aborted) controller.abort();
      else req.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    void this.runStream(req, handlers, controller).catch((error) => {
      if (controller.signal.aborted) {
        // Emit a terminal CANCELLED so a direct consumer doesn't hang. Through the
        // core this is a harmless no-op (its queue is already failed).
        handlers.onError(new ExpoAIError({ code: "CANCELLED", provider: PROVIDER }));
        return;
      }
      handlers.onError(ExpoAIError.from(error, PROVIDER));
    });
    return { cancel: () => controller.abort() };
  }

  /* ----------------------------- internals ----------------------------- */

  private url(path: string): string {
    return `${this.config.endpoint.replace(/\/$/, "")}${path}`;
  }

  private headers(): Record<string, string> {
    return { "content-type": "application/json", ...this.config.headers };
  }

  private payload(req: NormalizedGenerateRequest): WirePayload {
    const payload: WirePayload = { prompt: req.prompt };
    if (req.instructions !== undefined) payload.instructions = req.instructions;
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.maxOutputTokens !== undefined) payload.maxOutputTokens = req.maxOutputTokens;
    if (req.metadata !== undefined) payload.metadata = req.metadata;
    return payload;
  }

  private async postGenerate(
    payload: WirePayload,
    signal?: AbortSignal,
  ): Promise<AdapterGenerateResult> {
    const res = await this.fetchImpl(this.url(this.generatePath), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const data = (await res.json()) as {
      text?: string;
      finishReason?: AdapterGenerateResult["finishReason"];
      usage?: AdapterGenerateResult["usage"];
    };
    const result: AdapterGenerateResult = { text: data.text ?? "", raw: data };
    if (data.finishReason !== undefined) result.finishReason = data.finishReason;
    if (data.usage !== undefined) result.usage = data.usage;
    return result;
  }

  private async runStream(
    req: NormalizedGenerateRequest,
    handlers: AdapterStreamHandlers,
    controller: AbortController,
  ): Promise<void> {
    const res = await this.fetchImpl(this.url(this.streamPath), {
      method: "POST",
      headers: { ...this.headers(), accept: "text/event-stream" },
      body: JSON.stringify(this.payload(req)),
      signal: controller.signal,
    });
    if (!res.ok) throw await errorFromResponse(res);
    if (!res.body) throw await errorFromResponse(res, "Cloud stream returned an empty body.");

    handlers.onStart?.();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let sawDelta = false;
    let finishReason: AdapterGenerateResult["finishReason"];

    // Returns true on a terminal event ([DONE] / done); throws on a server error
    // event so it surfaces to the consumer as onError.
    const handleEvent = (raw: string): boolean => {
      // An SSE event may span multiple `data:` lines (joined with LF per spec).
      const data = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data.length === 0) return false;
      if (data === "[DONE]") return true;

      let event: {
        type?: string;
        text?: string;
        finishReason?: AdapterGenerateResult["finishReason"];
        code?: string;
        message?: string;
      };
      try {
        event = JSON.parse(data);
      } catch {
        return false; // ignore a non-JSON frame (comment / keepalive / partial)
      }

      if (event.type === "delta" && typeof event.text === "string") {
        // Suppress empty tokens (keep the delta stream meaningful + consistent
        // with the native bridges).
        if (event.text.length > 0) {
          full += event.text;
          sawDelta = true;
          handlers.onDelta(event.text);
        }
        return false;
      }
      if (event.type === "error") {
        throw ExpoAIError.from(
          { code: event.code, provider: PROVIDER, message: event.message ?? "Cloud stream error" },
          PROVIDER,
        );
      }
      if (event.type === "done") {
        // The streamed deltas are what the consumer already saw — keep them as the
        // source of truth; only adopt the server's text when no deltas were sent.
        if (!sawDelta && typeof event.text === "string") full = event.text;
        if (event.finishReason !== undefined) finishReason = event.finishReason;
        return true;
      }
      return false;
    };

    let finished = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // Normalize CRLF / CR line endings to LF (SSE permits all three).
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
        let separator = buffer.indexOf("\n\n");
        while (separator >= 0) {
          const rawEvent = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          if (handleEvent(rawEvent)) {
            finished = true;
            break;
          }
          separator = buffer.indexOf("\n\n");
        }
        if (finished) break;
      }
      // Flush any trailing multibyte sequence, then handle a final event that had
      // no trailing blank line.
      buffer += decoder.decode().replace(/\r\n?/g, "\n");
      if (!finished && buffer.trim().length > 0 && handleEvent(buffer)) finished = true;
    } finally {
      // Release/cancel the body so the underlying socket is torn down even when we
      // broke early on a terminal event or were aborted mid-stream.
      await reader.cancel().catch(() => undefined);
    }

    // A stream that ended with neither a terminator nor any content is a failure,
    // not a silent empty success.
    if (!finished && !sawDelta && full.length === 0) {
      throw new ExpoAIError({
        code: "NATIVE_PROVIDER_ERROR",
        provider: PROVIDER,
        message: "Cloud stream ended without any content.",
      });
    }

    const result: AdapterGenerateResult = { text: full };
    // Default to "stop" when the stream terminated cleanly; leave undefined when it
    // ended at EOF without an explicit terminator (signals possible truncation).
    result.finishReason = finished ? (finishReason ?? "stop") : finishReason;
    handlers.onDone(result);
  }
}

/* --------------------------- error mapping --------------------------- */

async function errorFromResponse(res: Response, fallbackMessage?: string): Promise<ExpoAIErrorPayload> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;

  // Pass the body through only when the backend speaks our error vocabulary (a
  // known ExpoAIErrorCode). An upstream provider's own code (e.g.
  // "rate_limit_exceeded", or a numeric code) must NOT bypass the HTTP-status
  // mapping below.
  if (bodyObj && isExpoAIErrorCode(bodyObj.code)) {
    return bodyObj as ExpoAIErrorPayload;
  }

  const message =
    (bodyObj && typeof bodyObj.message === "string" ? bodyObj.message : undefined) ??
    fallbackMessage ??
    `Cloud request failed with status ${res.status}`;

  return { code: statusToCode(res.status), provider: PROVIDER, message };
}

function statusToCode(status: number): ExpoAIErrorPayload["code"] {
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 422) return "INVALID_PROMPT";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 413) return "CONTEXT_WINDOW_EXCEEDED";
  return "NATIVE_PROVIDER_ERROR";
}
