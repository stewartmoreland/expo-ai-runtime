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

/**
 * Default order the router walks when no explicit provider is requested.
 * On-device providers come first. Apple Private Cloud Compute is off-device, so
 * it is reachable only with `fallback !== 'none'` or as the explicit provider.
 * Registered providers not listed here (e.g. `cloud`) are appended in
 * registration order.
 */
export const defaultProviderPriority: ExpoAIProvider[] = [
  'apple-foundation-models',
  'android-aicore-gemini-nano',
  'litert-lm',
  'apple-private-cloud-compute',
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
  | 'unsupported_locale'
  | 'quota_exhausted'
  | 'entitlement_missing'
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
  /** BCP-47 tags the provider's model supports, when the provider reports them. */
  supportedLanguages?: string[];
};

/**
 * App-wide privacy ceiling, set with {@link ExpoAI.setPrivacyPolicy}. The router
 * never routes to a provider outside it, even when explicitly requested.
 */
export type ExpoAIPrivacyPolicy = {
  /** Providers whose privacy mode is not listed are never routed to. */
  allowedModes: ExpoAIPrivacyMode[];
  /** Providers not listed are never routed to (intersected with `allowedModes`). */
  allowedProviders: ExpoAIProvider[];
  /** Treat every request as sensitive. OR-ed with `request.sensitive`; a request cannot opt out. */
  sensitiveByDefault?: boolean;
  /** After a locked policy is set, any further `setPrivacyPolicy` call throws. */
  lock?: boolean;
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

/** The provider / fallback / sensitive triple the router accepts. */
export type ExpoAIRoutingOptions = {
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
};

/** Why generation stopped. */
export type ExpoAIFinishReason =
  | 'stop'
  | 'length'
  | 'cancelled'
  | 'safety'
  | 'tool_calls'
  | 'unknown';

/** Where token counts came from. `'unavailable'` means no counts at all. */
export type ExpoAIUsageSource = 'provider' | 'estimated' | 'unavailable';

/** Token accounting. Counts are never zero-filled: a missing count is unknown. */
export type ExpoAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  source: ExpoAIUsageSource;
};

/** Reasoning effort hint. Ignored by providers that do not support it. */
export type ExpoAIReasoningLevel = 'light' | 'moderate' | 'deep';

/**
 * Structured-output strategy. `'native'` requires provider guided generation,
 * `'emulated'` always uses the schema prompt, `'auto'` prefers native.
 */
export type ExpoAIStructuredOutputMode = 'native' | 'emulated' | 'auto';

/** How a structured result was produced. `mode` is the strategy attempt 0 used. */
export type ExpoAIStructuredMeta = {
  mode: 'native' | 'emulated';
  attempts: number;
  usedRepair: boolean;
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
  /** Reasoning effort hint (Apple Private Cloud Compute). */
  reasoningLevel?: ExpoAIReasoningLevel;
  /**
   * Marks the prompt as sensitive. The router will refuse to send it to a
   * third-party cloud provider unless cloud fallback has been explicitly
   * enabled (docs/prd.md §13.3, §14). OR-ed with the privacy policy's
   * `sensitiveByDefault`.
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
  /** Structured-output strategy. Defaults to `'auto'`. */
  structuredOutput?: ExpoAIStructuredOutputMode;
};

/** Result of a non-streaming generation. */
export type GenerateResult = {
  text: string;
  provider: ExpoAIProvider;
  privacy: ExpoAIPrivacyInfo;
  /** True when the router used a provider other than the primary candidate. */
  usedFallback: boolean;
  finishReason?: ExpoAIFinishReason;
  /** Always present; `source: 'unavailable'` when the provider reported no counts. */
  usage: ExpoAIUsage;
  /** Set on structured-output (object) paths only. */
  structured?: ExpoAIStructuredMeta;
  /** Raw provider payload, for debugging. */
  raw?: unknown;
};

/** A chunk yielded by {@link ExpoAI.stream}. The iterable throws on error. */
export type GenerateChunk =
  | { type: 'start'; provider: ExpoAIProvider; privacy: ExpoAIPrivacyInfo }
  | { type: 'delta'; text: string }
  | { type: 'done'; result: GenerateResult };

/** Recursively-optional view of a type — the shape of a partial streamed object. */
export type DeepPartial<T> = T extends (infer U)[]
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
  /** Marks the session as sensitive; gates which providers it may bind to. */
  sensitive?: boolean;
  reasoningLevel?: ExpoAIReasoningLevel;
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
  structuredOutput?: ExpoAIStructuredOutputMode;
};

/** Options for {@link ExpoAI.prewarm}. */
export type PrewarmOptions = {
  provider?: ExpoAIProvider;
  instructions?: string;
  promptPrefix?: string;
};

/** Handle returned by event subscriptions. */
export type ExpoAISubscription = { remove(): void };

export interface ExpoAISession {
  readonly id: string;
  readonly provider: ExpoAIProvider;
  generate(options: SessionGenerateOptions): Promise<GenerateResult>;
  stream(options: SessionGenerateOptions): AsyncIterable<GenerateChunk>;
  generateObject<T = unknown>(options: SessionGenerateObjectOptions): Promise<T>;
  /** Like `generateObject`, plus the result metadata (usage, structured). */
  generateObjectWithMeta<T = unknown>(
    options: SessionGenerateObjectOptions,
  ): Promise<{ object: T; result: GenerateResult }>;
  /** Best-effort warm-up. Resolves false when the provider cannot prewarm. */
  prewarm(options?: { promptPrefix?: string }): Promise<boolean>;
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
