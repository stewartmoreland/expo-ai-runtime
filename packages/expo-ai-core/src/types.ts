/**
 * Core type surface for the Expo AI Runtime.
 *
 * Mirrors the shapes defined in docs/prd.md (sections 5–16). These types are
 * provider-agnostic: native and cloud adapters map their world onto them.
 */

/** Every provider the runtime knows how to route to. */
export type ExpoAIProvider =
  | 'system-preferred'
  | 'apple-foundation-models'
  | 'apple-private-cloud-compute'
  | 'android-aicore-gemini-nano'
  | 'litert-lm'
  | 'cloud'
  | 'none';

/** Default order the router walks when no explicit provider is requested. */
export const defaultProviderPriority: ExpoAIProvider[] = [
  'apple-foundation-models',
  'apple-private-cloud-compute',
  'android-aicore-gemini-nano',
  'litert-lm',
  'cloud',
];

/** Why a provider reports itself unavailable. */
export type ExpoAIUnavailableReason =
  | 'unsupported_os_version'
  | 'unsupported_device'
  | 'model_not_downloaded'
  | 'model_initializing'
  | 'apple_intelligence_disabled'
  | 'aicore_unavailable'
  | 'aicore_initializing'
  | 'unsupported_bootloader_state'
  | 'missing_dependency'
  | 'provider_not_configured'
  | 'unknown';

/** Where, broadly, a prompt was processed. Drives privacy UI copy. */
export type ExpoAIPrivacyMode =
  | 'on-device'
  | 'apple-private-cloud-compute'
  | 'third-party-cloud'
  | 'unknown';

/** Privacy metadata attached to every result. */
export type ExpoAIPrivacyInfo = {
  provider: ExpoAIProvider;
  isOnDevice: boolean;
  sendsPromptOffDevice: boolean;
  privacyMode: ExpoAIPrivacyMode;
};

/** Lightweight availability snapshot for a single provider. */
export type ExpoAIAvailability = {
  available: boolean;
  provider: ExpoAIProvider;
  reasonUnavailable?: ExpoAIUnavailableReason;
};

/** Full capability report for a provider (docs/prd.md §7). */
export type ExpoAICapabilities = {
  available: boolean;
  provider: ExpoAIProvider;

  isOnDevice: boolean;
  isSystemManagedModel: boolean;
  sendsPromptOffDevice: boolean;

  supportsTextGeneration: boolean;
  supportsStreaming: boolean;
  supportsSessions: boolean;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsImageInput: boolean;
  supportsSpeechInput: boolean;

  supportsSummarization: boolean;
  supportsRewrite: boolean;
  supportsProofreading: boolean;

  supportsBringYourOwnModel: boolean;
  supportsModelDownload: boolean;

  contextWindow?: number;

  reasonUnavailable?: ExpoAIUnavailableReason;
};

/** Pairs a provider with its current capabilities. */
export type ExpoAIProviderInfo = {
  provider: ExpoAIProvider;
  capabilities: ExpoAICapabilities;
};

/** Fallback policy for a request. */
export type ExpoAIFallback = 'none' | 'cloud' | 'any';

/** Why generation stopped. */
export type ExpoAIFinishReason =
  | 'stop'
  | 'length'
  | 'cancelled'
  | 'safety'
  | 'tool_calls'
  | 'unknown';

/** Token accounting, when a provider reports it. */
export type ExpoAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** Bring-your-own-model descriptor (LiteRT-LM and friends; future). */
export type LocalModelConfig = {
  id: string;
  runtime: 'litert-lm';
  source: 'bundled' | 'remote' | 'huggingface' | 'file';
  uri?: string;
  checksum?: string;
  sizeBytes?: number;
  license?: string;
};

/** Options accepted by {@link ExpoAI.generate} / {@link ExpoAI.stream}. */
export type GenerateOptions = {
  prompt: string;
  /** Preferred provider. Omit (or "system-preferred") to use the default priority. */
  provider?: ExpoAIProvider;
  /** Whether the router may fall back to other providers. Defaults to "none". */
  fallback?: ExpoAIFallback;
  /** System / role instructions for this generation. */
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Marks the prompt as sensitive. The router will refuse to send it to a
   * third-party cloud provider unless cloud fallback has been explicitly
   * enabled (docs/prd.md §13.3, §14).
   */
  sensitive?: boolean;
  /** BYOM descriptor (future). */
  model?: LocalModelConfig;
  metadata?: Record<string, string>;
  /** Abort the request (cancels native/cloud streaming). */
  signal?: AbortSignal;
};

/** A loose, runtime JSON Schema (the subset the runtime validates). */
export type JSONSchemaType =
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  /** Passthrough for keywords the validator does not yet enforce. */
  [key: string]: unknown;
}

/** Options for {@link ExpoAI.generateObject}. */
export type GenerateObjectOptions = GenerateOptions & {
  schema: JSONSchema;
  /** Optional name for the schema, surfaced to providers that support it. */
  schemaName?: string;
  /** How many validate→repair cycles to attempt. Defaults to 2. */
  maxRepairAttempts?: number;
};

/** Result of a non-streaming generation. */
export type GenerateResult = {
  text: string;
  provider: ExpoAIProvider;
  privacy: ExpoAIPrivacyInfo;
  /** True when the router used a provider other than the primary candidate. */
  usedFallback: boolean;
  finishReason?: ExpoAIFinishReason;
  usage?: ExpoAIUsage;
  /** Raw provider payload, for debugging. */
  raw?: unknown;
};

/** A chunk yielded by {@link ExpoAI.stream}. The iterable throws on error. */
export type GenerateChunk =
  | { type: 'start'; provider: ExpoAIProvider; privacy: ExpoAIPrivacyInfo }
  | { type: 'delta'; text: string }
  | { type: 'done'; result: GenerateResult };

/** Recursively-optional view of a type — the shape of a partial streamed object. */
export type DeepPartial<T> =
  T extends (infer U)[]
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/** Options for {@link ExpoAI.streamObject} (same shape as generateObject). */
export type StreamObjectOptions = GenerateObjectOptions;

/**
 * Handle returned by {@link ExpoAI.streamObject}. Consume `partialObjectStream`
 * for progressively-complete snapshots as tokens arrive, and/or await `object`
 * for the validated (repaired) final value. All four views are backed by one
 * underlying generation; on failure the streams throw and the promises reject
 * with the same {@link ExpoAIError}.
 */
export interface StreamObjectResult<T = unknown> {
  /** Best-effort partial snapshots as tokens arrive. The last equals `object`. */
  readonly partialObjectStream: AsyncIterable<DeepPartial<T>>;
  /** Raw text deltas, for callers that also want the token stream. */
  readonly textStream: AsyncIterable<string>;
  /** The validated final object (after repair). Rejects with an ExpoAIError. */
  readonly object: Promise<T>;
  /** Full result metadata (provider, privacy, usedFallback). */
  readonly result: Promise<GenerateResult>;
}

/* ------------------------------------------------------------------ */
/* Sessions (docs/prd.md §8)                                          */
/* ------------------------------------------------------------------ */

export type CreateSessionOptions = {
  instructions?: string;
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type SessionGenerateOptions = {
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type SessionGenerateObjectOptions = SessionGenerateOptions & {
  schema: JSONSchema;
  schemaName?: string;
  maxRepairAttempts?: number;
};

export interface ExpoAISession {
  readonly id: string;
  readonly provider: ExpoAIProvider;
  generate(options: SessionGenerateOptions): Promise<GenerateResult>;
  stream(options: SessionGenerateOptions): AsyncIterable<GenerateChunk>;
  generateObject<T = unknown>(options: SessionGenerateObjectOptions): Promise<T>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Task helpers (docs/prd.md §6)                                      */
/* ------------------------------------------------------------------ */

export type SummarizeOptions = {
  text: string;
  /** Hint for how long the summary should be. */
  length?: 'short' | 'medium' | 'long';
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
  signal?: AbortSignal;
};

export type RewriteStyle =
  | 'rephrase'
  | 'shorten'
  | 'elaborate'
  | 'friendly'
  | 'professional'
  | 'emojify';

export type RewriteOptions = {
  text: string;
  style?: RewriteStyle;
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
  signal?: AbortSignal;
};

export type ProofreadOptions = {
  text: string;
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
  signal?: AbortSignal;
};
