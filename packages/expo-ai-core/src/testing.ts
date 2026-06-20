/**
 * @stewmore/expo-ai-core/testing
 *
 * A configurable in-memory adapter. Used by the core test suite, the evals
 * package, and as a web/simulator fallback in the example apps so the runtime
 * has something to route to when no native provider exists.
 */

import type {
  AdapterGenerateResult,
  AdapterRewriteRequest,
  AdapterStreamHandlers,
  AdapterTaskRequest,
  ExpoAIAdapter,
  NormalizedGenerateRequest,
  NormalizedObjectRequest,
  StreamHandle,
} from "./adapter.js";
import { ExpoAIError } from "./errors.js";
import type {
  ExpoAIAvailability,
  ExpoAICapabilities,
  ExpoAIProvider,
  ExpoAIUnavailableReason,
} from "./types.js";

export type MockAdapterConfig = {
  provider?: ExpoAIProvider;
  available?: boolean;
  reasonUnavailable?: ExpoAIUnavailableReason;
  capabilities?: Partial<ExpoAICapabilities>;
  /** Static reply, or a function of the (composed) prompt. */
  respondWith?: string | ((prompt: string) => string);
  /** Native structured output: returns JSON text for a schema request. */
  objectText?: string | ((req: NormalizedObjectRequest) => string);
  /** Expose native task helpers (summarize/rewrite/proofread). */
  supportsTasks?: boolean;
  /** Expose native streaming (deltas word-by-word). */
  supportsStreaming?: boolean;
  /** Throw this error from generate/stream. */
  throwError?: unknown;
  /** Throw once, then succeed (simulates a transient failure with fallback). */
  throwOnce?: unknown;
  /** Per-token delay (ms) for streaming. */
  delayMs?: number;
};

const DEFAULT_CAPABILITIES: Omit<ExpoAICapabilities, "provider"> = {
  available: true,
  isOnDevice: true,
  isSystemManagedModel: true,
  sendsPromptOffDevice: false,
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsSessions: true,
  supportsStructuredOutput: true,
  supportsTools: false,
  supportsImageInput: false,
  supportsSpeechInput: false,
  supportsSummarization: true,
  supportsRewrite: true,
  supportsProofreading: true,
  supportsBringYourOwnModel: false,
  supportsModelDownload: false,
  contextWindow: 4096,
};

export class MockAdapter implements ExpoAIAdapter {
  readonly provider: ExpoAIProvider;
  private threwOnce = false;
  generate: (req: NormalizedGenerateRequest) => Promise<AdapterGenerateResult>;
  stream?: (req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers) => StreamHandle;
  generateObject?: (req: NormalizedObjectRequest) => Promise<AdapterGenerateResult>;
  summarize?: (req: AdapterTaskRequest) => Promise<AdapterGenerateResult>;
  rewrite?: (req: AdapterRewriteRequest) => Promise<AdapterGenerateResult>;
  proofread?: (req: AdapterTaskRequest) => Promise<AdapterGenerateResult>;

  constructor(private readonly config: MockAdapterConfig = {}) {
    this.provider = config.provider ?? "cloud";

    this.generate = (req) => this.produce(req.prompt);

    if (config.supportsStreaming ?? true) {
      this.stream = (req, handlers) => this.streamImpl(req, handlers);
    }
    if (config.objectText !== undefined) {
      this.generateObject = (req) =>
        Promise.resolve({
          text:
            typeof config.objectText === "function"
              ? config.objectText(req)
              : (config.objectText as string),
          finishReason: "stop",
        });
    }
    if (config.supportsTasks) {
      this.summarize = (req) => this.produce(`summary of: ${req.text}`);
      this.rewrite = (req) => this.produce(`rewritten (${req.style ?? "rephrase"}): ${req.text}`);
      this.proofread = (req) => this.produce(`proofread: ${req.text}`);
    }
  }

  async getAvailability(): Promise<ExpoAIAvailability> {
    const available = this.config.available ?? true;
    const availability: ExpoAIAvailability = { available, provider: this.provider };
    if (!available) {
      availability.reasonUnavailable = this.config.reasonUnavailable ?? "unknown";
    }
    return availability;
  }

  async getCapabilities(): Promise<ExpoAICapabilities> {
    return {
      ...DEFAULT_CAPABILITIES,
      provider: this.provider,
      available: this.config.available ?? true,
      ...this.config.capabilities,
    };
  }

  private replyFor(prompt: string): string {
    if (this.config.respondWith === undefined) return `[mock:${this.provider}] ${prompt}`;
    return typeof this.config.respondWith === "function"
      ? this.config.respondWith(prompt)
      : this.config.respondWith;
  }

  private async produce(prompt: string): Promise<AdapterGenerateResult> {
    if (this.config.throwError !== undefined) {
      throw ExpoAIError.from(this.config.throwError, this.provider);
    }
    if (this.config.throwOnce !== undefined && !this.threwOnce) {
      this.threwOnce = true;
      throw ExpoAIError.from(this.config.throwOnce, this.provider);
    }
    return { text: this.replyFor(prompt), finishReason: "stop" };
  }

  private streamImpl(req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers): StreamHandle {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const result = await this.produce(req.prompt);
      handlers.onStart?.();
      const tokens = result.text.split(/(\s+)/).filter((t) => t.length > 0);
      for (const token of tokens) {
        if (cancelled) return;
        if (this.config.delayMs) await delay(this.config.delayMs);
        if (cancelled) return;
        handlers.onDelta(token);
      }
      if (!cancelled) handlers.onDone(result);
    };
    run().catch((error) => {
      if (!cancelled) handlers.onError(ExpoAIError.from(error, this.provider));
    });
    return {
      cancel: () => {
        cancelled = true;
      },
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockAdapter(config: MockAdapterConfig = {}): MockAdapter {
  return new MockAdapter(config);
}
