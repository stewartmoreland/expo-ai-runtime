/**
 * The adapter contract (docs/prd.md §9).
 *
 * Provider packages (Apple, Android, cloud) implement {@link ExpoAIAdapter} and
 * register it with the core registry. Adapters speak in *normalized requests*
 * and return *adapter results* (text + finish reason + usage); the router is
 * responsible for stamping provider + privacy metadata onto the public result.
 */

import type { ExpoAIError } from "./errors.js";
import type {
  CreateSessionOptions,
  ExpoAIAvailability,
  ExpoAICapabilities,
  ExpoAIFinishReason,
  ExpoAIProvider,
  ExpoAIUsage,
  JSONSchema,
  LocalModelConfig,
} from "./types.js";

/** A request after the router has stripped routing/fallback concerns. */
export type NormalizedGenerateRequest = {
  prompt: string;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
  model?: LocalModelConfig;
};

export type NormalizedObjectRequest = NormalizedGenerateRequest & {
  schema: JSONSchema;
  schemaName?: string;
};

/** What an adapter returns from a generation. */
export type AdapterGenerateResult = {
  text: string;
  finishReason?: ExpoAIFinishReason;
  usage?: ExpoAIUsage;
  raw?: unknown;
};

export type AdapterStreamHandlers = {
  onStart?: () => void;
  onDelta: (text: string) => void;
  onDone: (result: AdapterGenerateResult) => void;
  onError: (error: ExpoAIError) => void;
};

export type StreamHandle = {
  cancel: () => void;
};

/** A provider-native (or emulated) stateful session. */
export interface AdapterSession {
  readonly id: string;
  readonly provider: ExpoAIProvider;
  generate(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult>;
  stream?(req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers): StreamHandle;
  generateObject?(req: NormalizedObjectRequest): Promise<AdapterGenerateResult>;
  /**
   * Run a generation with the session's context but WITHOUT committing it to the
   * transcript — used for structured-output repair attempts so they don't grow
   * the conversation. Adapters that can't do this simply omit it.
   */
  generateEphemeral?(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult>;
  /** Commit a single (user, assistant) turn to the transcript. */
  commitTurn?(userPrompt: string, assistantText: string): void;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export type AdapterTaskRequest = NormalizedGenerateRequest & {
  /** The text the task operates on (the thing to summarize / rewrite / proofread). */
  text: string;
  /** Length hint for summarization ("short" | "medium" | "long"). */
  length?: string;
};

export type AdapterRewriteRequest = AdapterTaskRequest & {
  style?: string;
};

/**
 * A single provider behind the runtime. All methods past `generate` are
 * optional; the core supplies cross-provider emulation (sessions, structured
 * output, task helpers, single-shot streaming) when an adapter lacks them.
 */
export interface ExpoAIAdapter {
  readonly provider: ExpoAIProvider;

  getAvailability(): Promise<ExpoAIAvailability>;
  getCapabilities(): Promise<ExpoAICapabilities>;

  generate(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult>;

  stream?(req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers): StreamHandle;
  createSession?(opts: CreateSessionOptions): Promise<AdapterSession>;

  /** Native guided / structured generation. Returns JSON *text* for the core to parse + validate. */
  generateObject?(req: NormalizedObjectRequest): Promise<AdapterGenerateResult>;

  summarize?(req: AdapterTaskRequest): Promise<AdapterGenerateResult>;
  rewrite?(req: AdapterRewriteRequest): Promise<AdapterGenerateResult>;
  proofread?(req: AdapterTaskRequest): Promise<AdapterGenerateResult>;
}
