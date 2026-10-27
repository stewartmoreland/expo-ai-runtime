/**
 * Shared factory for native (on-device) provider adapters.
 *
 * The Apple and Android bridges are otherwise ~95% identical, so the entire
 * native-event→{@link AdapterStreamHandlers} bridge, capability gating, error
 * normalization, and session wrapping live here once (and are unit-tested with a
 * mock native module). A provider package just supplies its native module + a
 * capability profile and registers the result.
 */

import type {
  AdapterGenerateResult,
  AdapterSession,
  AdapterStreamHandlers,
  AdapterUsage,
  ExpoAIAdapter,
  NormalizedGenerateRequest,
  StreamHandle,
} from './adapter.js';
import { unavailableCapabilities } from './capability-registry.js';
import { ExpoAIError } from './errors.js';
import { USAGE_COUNTS } from './result.js';
import type {
  CreateSessionOptions,
  ExpoAIAvailability,
  ExpoAICapabilities,
  ExpoAIFinishReason,
  ExpoAIProvider,
  ExpoAIUnavailableReason,
  ExpoAIUsageSource,
} from './types.js';

/* --------------------------- native module shape --------------------------- */

export type NativeAvailability = {
  available: boolean;
  provider?: string;
  reasonUnavailable?: string;
  supportedLanguages?: string[];
  contextWindow?: number;
};

export type NativeGenerateResult = {
  text: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    source?: string;
  };
  /** Error-as-value: native resolves (not rejects) with this on failure so the payload survives the bridge. */
  error?: Record<string, unknown>;
};

export type NativeStreamEvent = {
  requestId: string;
  type: 'start' | 'token' | 'done' | 'error';
  text?: string;
  result?: NativeGenerateResult;
  error?: Record<string, unknown>;
};

export type NativeSubscription = { remove: () => void };

/** The primitive surface every native AI module exposes (docs/prd.md §9). */
export interface NativeStreamingModule {
  getAvailability(): Promise<NativeAvailability>;
  generate(options: Record<string, unknown>): Promise<NativeGenerateResult>;
  createSession?(
    options: Record<string, unknown>,
  ): Promise<{ sessionId: string; provider?: string }>;
  generateInSession?(
    sessionId: string,
    options: Record<string, unknown>,
  ): Promise<NativeGenerateResult>;
  resetSession?(sessionId: string): Promise<void>;
  disposeSession?(sessionId: string): Promise<void>;
  startStreaming(requestId: string, options: Record<string, unknown>): Promise<void>;
  cancelStreaming(requestId: string): Promise<void>;
  /** Native guided generation; `text` is the JSON string. */
  generateObject?(options: Record<string, unknown>): Promise<NativeGenerateResult>;
  /** Cancel an in-flight generate / object / session request by its `requestId` option. */
  cancel?(requestId: string): Promise<void>;
  prewarm?(options: Record<string, unknown>): Promise<boolean>;
  prewarmSession?(sessionId: string, options: Record<string, unknown>): Promise<boolean>;
  addListener(
    eventName: 'onExpoAIStream',
    listener: (event: NativeStreamEvent) => void,
  ): NativeSubscription;
}

/** The static capability flags for an *available* provider. */
export type NativeCapabilityProfile = Omit<
  ExpoAICapabilities,
  'available' | 'provider' | 'reasonUnavailable'
>;

export type NativeAdapterOptions = {
  provider: ExpoAIProvider;
  capabilityProfile: NativeCapabilityProfile;
};

/* ------------------------------- internals -------------------------------- */

let requestCounter = 0;
function newRequestId(provider: ExpoAIProvider): string {
  requestCounter += 1;
  return `${provider}_${requestCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function nativeOptions(req: NormalizedGenerateRequest): Record<string, unknown> {
  const options: Record<string, unknown> = { prompt: req.prompt };
  if (req.instructions !== undefined) options.instructions = req.instructions;
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.maxOutputTokens !== undefined) options.maxOutputTokens = req.maxOutputTokens;
  if (req.reasoningLevel !== undefined) options.reasoningLevel = req.reasoningLevel;
  return options;
}

const USAGE_SOURCES: readonly string[] = ['provider', 'estimated', 'unavailable'];

function mapResult(result: NativeGenerateResult): AdapterGenerateResult {
  const mapped: AdapterGenerateResult = { text: result.text };
  if (result.finishReason) {
    mapped.finishReason = result.finishReason as ExpoAIFinishReason;
  }
  if (result.usage) {
    const usage: AdapterUsage = {};
    for (const key of USAGE_COUNTS) {
      if (typeof result.usage[key] === 'number') usage[key] = result.usage[key];
    }
    if (result.usage.source && USAGE_SOURCES.includes(result.usage.source)) {
      usage.source = result.usage.source as ExpoAIUsageSource;
    }
    mapped.usage = usage;
  }
  return mapped;
}

/** Throw an error-as-value native result as a typed {@link ExpoAIError}. */
function unwrap(result: NativeGenerateResult, provider: ExpoAIProvider): AdapterGenerateResult {
  if (result.error) throw ExpoAIError.from(result.error, provider);
  return mapResult(result);
}

/**
 * Run a request-scoped native call: `run` gets a fresh `requestId`, and aborting
 * `req.signal` asks native to `cancel(requestId)`.
 */
async function cancellable(
  native: NativeStreamingModule,
  provider: ExpoAIProvider,
  req: NormalizedGenerateRequest,
  run: (requestId: string) => Promise<NativeGenerateResult>,
): Promise<AdapterGenerateResult> {
  if (req.signal?.aborted) throw new ExpoAIError({ code: 'CANCELLED', provider });
  const requestId = newRequestId(provider);
  const onAbort = () => void native.cancel?.(requestId).catch(() => undefined);
  req.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return unwrap(await run(requestId), provider);
  } catch (error) {
    throw ExpoAIError.from(error, provider);
  } finally {
    req.signal?.removeEventListener('abort', onAbort);
  }
}

function resolveDoneResult(
  result: NativeGenerateResult | undefined,
  accumulated: string,
): AdapterGenerateResult {
  // The streamed tokens are the source of truth; fall back to them when the
  // native `done` event carries no (or empty) text.
  if (result) {
    const mapped = mapResult(result);
    if (mapped.text.length === 0 && accumulated.length > 0) mapped.text = accumulated;
    return mapped;
  }
  return { text: accumulated };
}

function bridgeNativeStream(
  native: NativeStreamingModule,
  provider: ExpoAIProvider,
  req: NormalizedGenerateRequest,
  handlers: AdapterStreamHandlers,
): StreamHandle {
  const requestId = newRequestId(provider);
  let settled = false;
  let accumulated = '';

  const subscription = native.addListener('onExpoAIStream', (event) => {
    if (settled || event.requestId !== requestId) return;
    switch (event.type) {
      case 'start':
        handlers.onStart?.();
        break;
      case 'token':
        // Suppress empty tokens (the Android native path can emit "").
        if (typeof event.text === 'string' && event.text.length > 0) {
          accumulated += event.text;
          handlers.onDelta(event.text);
        }
        break;
      case 'done':
        settled = true;
        subscription.remove();
        if (event.result?.error) handlers.onError(ExpoAIError.from(event.result.error, provider));
        else handlers.onDone(resolveDoneResult(event.result, accumulated));
        break;
      case 'error':
        settled = true;
        subscription.remove();
        handlers.onError(ExpoAIError.from(event.error, provider));
        break;
      default:
        // Unknown event type — ignore it (do not terminate the stream).
        break;
    }
  });

  native.startStreaming(requestId, nativeOptions(req)).catch((error) => {
    if (settled) return; // a cancel (or terminal event) already finished the stream
    settled = true;
    subscription.remove();
    handlers.onError(ExpoAIError.from(error, provider));
  });

  return {
    cancel: () => {
      if (settled) return;
      settled = true;
      void native.cancelStreaming(requestId).catch(() => undefined);
      subscription.remove();
    },
  };
}

async function createNativeSession(
  native: NativeStreamingModule,
  provider: ExpoAIProvider,
  options: CreateSessionOptions,
): Promise<AdapterSession> {
  const createOptions: Record<string, unknown> = {};
  if (options.instructions !== undefined) createOptions.instructions = options.instructions;

  let sessionId: string;
  try {
    ({ sessionId } = await native.createSession!(createOptions));
  } catch (error) {
    throw ExpoAIError.from(error, provider);
  }

  return {
    id: sessionId,
    provider,
    generate(req) {
      return cancellable(native, provider, req, (requestId) =>
        native.generateInSession!(sessionId, { ...nativeOptions(req), requestId }),
      );
    },
    async prewarm(opts) {
      return (await native.prewarmSession?.(sessionId, opts).catch(() => false)) ?? false;
    },
    async reset() {
      try {
        await native.resetSession?.(sessionId);
      } catch (error) {
        throw ExpoAIError.from(error, provider);
      }
    },
    async dispose() {
      try {
        await native.disposeSession?.(sessionId);
      } catch (error) {
        throw ExpoAIError.from(error, provider);
      }
    },
  };
}

/* ------------------------------- factories -------------------------------- */

/** Build an {@link ExpoAIAdapter} backed by a native streaming module. */
export function createNativeAdapter(
  native: NativeStreamingModule,
  options: NativeAdapterOptions,
): ExpoAIAdapter {
  const { provider, capabilityProfile } = options;

  async function probe(): Promise<NativeAvailability> {
    try {
      return await native.getAvailability();
    } catch {
      // A failed availability probe means the provider is unusable, not an error
      // to throw at the caller.
      return { available: false, reasonUnavailable: 'unknown' };
    }
  }

  const adapter: ExpoAIAdapter = {
    provider,
    async getAvailability() {
      const raw = await probe();
      const availability: ExpoAIAvailability = { available: raw.available, provider };
      if (raw.reasonUnavailable) {
        availability.reasonUnavailable = raw.reasonUnavailable as ExpoAIUnavailableReason;
      }
      if (raw.supportedLanguages) availability.supportedLanguages = raw.supportedLanguages;
      return availability;
    },
    async getCapabilities() {
      const raw = await probe();
      if (!raw.available) {
        return unavailableCapabilities(
          provider,
          (raw.reasonUnavailable as ExpoAIUnavailableReason | undefined) ?? 'unknown',
        );
      }
      return {
        available: true,
        provider,
        ...capabilityProfile,
        ...(raw.contextWindow ? { contextWindow: raw.contextWindow } : {}),
      };
    },
    generate(req) {
      return cancellable(native, provider, req, (requestId) =>
        native.generate({ ...nativeOptions(req), requestId }),
      );
    },
    stream(req, handlers) {
      return bridgeNativeStream(native, provider, req, handlers);
    },
  };

  if (native.generateObject) {
    adapter.generateObject = (req) =>
      cancellable(native, provider, req, (requestId) =>
        native.generateObject!({
          ...nativeOptions(req),
          requestId,
          schemaJson: JSON.stringify(req.schema),
          ...(req.schemaName !== undefined ? { schemaName: req.schemaName } : {}),
        }),
      );
  }

  if (native.prewarm) {
    adapter.prewarm = (opts) => native.prewarm!(opts).catch(() => false);
  }

  if (native.createSession) {
    adapter.createSession = (sessionOptions) =>
      createNativeSession(native, provider, sessionOptions);
  }

  return adapter;
}

/** An always-unavailable adapter for the wrong platform / a missing native module. */
export function createUnavailableNativeAdapter(
  provider: ExpoAIProvider,
  reason: ExpoAIUnavailableReason,
): ExpoAIAdapter {
  return {
    provider,
    async getAvailability() {
      return { available: false, provider, reasonUnavailable: reason };
    },
    async getCapabilities() {
      return unavailableCapabilities(provider, reason);
    },
    async generate() {
      throw new ExpoAIError({
        code: 'UNAVAILABLE',
        provider,
        message: `${provider} is unavailable (${reason}).`,
      });
    },
  };
}
