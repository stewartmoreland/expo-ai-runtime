/**
 * Provider router (docs/prd.md §13).
 *
 * Routing rules:
 *   1. Try the requested provider (or the default priority order).
 *   2. If unavailable and fallback is allowed, advance to the next provider.
 *   3. If the prompt is sensitive and cloud fallback is disabled, fail locally.
 *   4. Stamp provider + privacy metadata onto every result.
 */

import type {
  AdapterGenerateResult,
  ExpoAIAdapter,
  NormalizedGenerateRequest,
  NormalizedObjectRequest,
} from './adapter.js';
import { ExpoAIError } from './errors.js';
import { privacyModeForProvider } from './privacy.js';
import { getAdapter, hasAdapter } from './registry.js';
import { finalizeResult } from './result.js';
import { createStreamIterable, type StreamSource } from './stream-bridge.js';
import { generateValidatedObject } from './structured-output.js';
import {
  defaultProviderPriority,
  type ExpoAIAvailability,
  type ExpoAIFallback,
  type ExpoAIProvider,
  type GenerateChunk,
  type GenerateObjectOptions,
  type GenerateOptions,
  type GenerateResult,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Candidate selection                                                */
/* ------------------------------------------------------------------ */

type RoutingPolicy = {
  provider?: ExpoAIProvider;
  fallback: ExpoAIFallback;
  sensitive: boolean;
};

function policyFrom(options: {
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
}): RoutingPolicy {
  return {
    provider:
      options.provider && options.provider !== 'system-preferred' ? options.provider : undefined,
    fallback: options.fallback ?? 'none',
    sensitive: options.sensitive ?? false,
  };
}

/**
 * The ordered, gated list of providers to attempt for a request. Filtered to
 * registered adapters and to providers the privacy/fallback policy permits.
 */
export function buildCandidateList(options: {
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
}): ExpoAIProvider[] {
  const policy = policyFrom(options);
  const cloudAllowed = policy.fallback === 'cloud' || policy.fallback === 'any';

  // With no explicit provider, the router considers all on-device system
  // providers by priority regardless of `fallback` (cloud is gated separately
  // below). `fallback` only restricts falling back *away from an explicitly
  // chosen provider* — moving between on-device system providers is not
  // "falling back" in the privacy sense.
  const base: ExpoAIProvider[] = policy.provider
    ? [
        policy.provider,
        ...(policy.fallback !== 'none'
          ? defaultProviderPriority.filter((p) => p !== policy.provider)
          : []),
      ]
    : [...defaultProviderPriority];

  const result: ExpoAIProvider[] = [];
  base.forEach((provider, index) => {
    if (!hasAdapter(provider)) return;
    const isExplicitPrimary = policy.provider === provider && index === 0;

    // Cloud is opt-in: only used when explicitly requested or fallback enables it.
    if (provider === 'cloud' && !isExplicitPrimary && !cloudAllowed) return;

    // Sensitivity gate: never send a sensitive prompt to a third-party cloud
    // unless cloud is *explicitly* opted into — fallback "cloud" or an explicit
    // cloud provider. A loose fallback of "any" is not enough. On-device and
    // Apple Private Cloud Compute (Apple-managed) remain permitted (docs/prd.md
    // §13.3, §14).
    if (
      policy.sensitive &&
      privacyModeForProvider(provider) === 'third-party-cloud' &&
      !isExplicitPrimary &&
      policy.fallback !== 'cloud'
    ) {
      return;
    }

    result.push(provider);
  });
  return result;
}

/**
 * The provider the caller intended as primary: the explicitly-requested provider
 * if any, otherwise the highest-priority candidate. `usedFallback` is true when
 * the provider that actually served the request is not this one.
 */
function intendedPrimaryProvider(
  providerOption: ExpoAIProvider | undefined,
  candidates: ExpoAIProvider[],
): ExpoAIProvider {
  if (providerOption && providerOption !== 'system-preferred') return providerOption;
  return candidates[0] as ExpoAIProvider;
}

function normalizeRequest(options: GenerateOptions): NormalizedGenerateRequest {
  const req: NormalizedGenerateRequest = { prompt: options.prompt };
  if (options.instructions !== undefined) req.instructions = options.instructions;
  if (options.temperature !== undefined) req.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) req.maxOutputTokens = options.maxOutputTokens;
  if (options.metadata !== undefined) req.metadata = options.metadata;
  if (options.signal !== undefined) req.signal = options.signal;
  if (options.model !== undefined) req.model = options.model;
  return req;
}

function unavailableError(provider: ExpoAIProvider, availability: ExpoAIAvailability): ExpoAIError {
  return new ExpoAIError({
    code: 'UNAVAILABLE',
    provider,
    message: availability.reasonUnavailable
      ? `Provider ${provider} is unavailable: ${availability.reasonUnavailable}`
      : `Provider ${provider} is unavailable.`,
    fallbackRecommended: true,
  });
}

function noProviderError(): ExpoAIError {
  return new ExpoAIError({
    code: 'UNAVAILABLE',
    provider: 'none',
    message: 'No AI provider is available for this request.',
    fallbackRecommended: false,
  });
}

function validatePrompt(prompt: string, provider: ExpoAIProvider): void {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new ExpoAIError({ code: 'INVALID_PROMPT', provider });
  }
}

/**
 * Reject with CANCELLED if `signal` is (or becomes) aborted before `promise`
 * settles. Native generation can't always be torn down, but the JS caller still
 * gets a prompt CANCELLED instead of waiting for a result it no longer wants.
 */
function withSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  provider: ExpoAIProvider,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ExpoAIError({ code: 'CANCELLED', provider }));
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new ExpoAIError({ code: 'CANCELLED', provider })),
        {
          once: true,
        },
      );
    }),
  ]);
}

/**
 * Select the first available adapter for a request (availability-based only;
 * does not attempt generation). Used by streaming and session creation.
 */
export async function selectAvailableAdapter(options: {
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
}): Promise<{ adapter: ExpoAIAdapter; provider: ExpoAIProvider; usedFallback: boolean }> {
  const candidates = buildCandidateList(options);
  if (candidates.length === 0) throw noProviderError();
  const primary = intendedPrimaryProvider(options.provider, candidates);

  let lastError: ExpoAIError | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i] as ExpoAIProvider;
    const adapter = getAdapter(provider);
    if (!adapter) continue;
    const availability = await adapter.getAvailability();
    if (availability.available) {
      return { adapter, provider, usedFallback: provider !== primary };
    }
    lastError = unavailableError(provider, availability);
  }
  throw lastError ?? noProviderError();
}

/* ------------------------------------------------------------------ */
/* generate                                                           */
/* ------------------------------------------------------------------ */

export async function routeGenerate(options: GenerateOptions): Promise<GenerateResult> {
  const candidates = buildCandidateList(options);
  if (candidates.length === 0) throw noProviderError();
  validatePrompt(options.prompt, candidates[0] as ExpoAIProvider);
  const primary = intendedPrimaryProvider(options.provider, candidates);

  const req = normalizeRequest(options);
  let lastError: ExpoAIError | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i] as ExpoAIProvider;
    const adapter = getAdapter(provider);
    if (!adapter) continue;

    const availability = await adapter.getAvailability();
    if (!availability.available) {
      lastError = unavailableError(provider, availability);
      continue;
    }

    try {
      const result = await withSignal(adapter.generate(req), options.signal, provider);
      return finalizeResult(result, provider, provider !== primary);
    } catch (error) {
      const normalized = ExpoAIError.from(error, provider);
      lastError = normalized;
      if (!normalized.fallbackRecommended) throw normalized;
    }
  }
  throw lastError ?? noProviderError();
}

/* ------------------------------------------------------------------ */
/* generateObject                                                     */
/* ------------------------------------------------------------------ */

export async function routeGenerateObject<T = unknown>(options: GenerateObjectOptions): Promise<T> {
  const { object } = await routeGenerateObjectWithMeta(options);
  return object as T;
}

export async function routeGenerateObjectWithMeta(options: GenerateObjectOptions): Promise<{
  object: unknown;
  result: GenerateResult;
}> {
  const candidates = buildCandidateList(options);
  if (candidates.length === 0) throw noProviderError();
  validatePrompt(options.prompt, candidates[0] as ExpoAIProvider);
  const primary = intendedPrimaryProvider(options.provider, candidates);

  const baseReq = normalizeRequest(options);
  let lastError: ExpoAIError | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i] as ExpoAIProvider;
    const adapter = getAdapter(provider);
    if (!adapter) continue;

    const availability = await adapter.getAvailability();
    if (!availability.available) {
      lastError = unavailableError(provider, availability);
      continue;
    }

    const objectReq: NormalizedObjectRequest = { ...baseReq, schema: options.schema };
    if (options.schemaName !== undefined) objectReq.schemaName = options.schemaName;

    try {
      const validated = await withSignal(
        generateValidatedObject({
          provider,
          schema: options.schema,
          basePrompt: options.prompt,
          ...(options.schemaName !== undefined ? { schemaName: options.schemaName } : {}),
          ...(options.maxRepairAttempts !== undefined
            ? { maxRepairAttempts: options.maxRepairAttempts }
            : {}),
          generateText: async (prompt) => (await adapter.generate({ ...baseReq, prompt })).text,
          ...(adapter.generateObject
            ? { nativeObject: async () => (await adapter.generateObject!(objectReq)).text }
            : {}),
        }),
        options.signal,
        provider,
      );

      const result = finalizeResult(
        { text: validated.raw, raw: validated.object },
        provider,
        provider !== primary,
      );
      return { object: validated.object, result };
    } catch (error) {
      const normalized = ExpoAIError.from(error, provider);
      lastError = normalized;
      if (!normalized.fallbackRecommended) throw normalized;
    }
  }
  throw lastError ?? noProviderError();
}

/* ------------------------------------------------------------------ */
/* stream                                                             */
/* ------------------------------------------------------------------ */

export function routeStream(options: GenerateOptions): AsyncIterable<GenerateChunk> {
  return { [Symbol.asyncIterator]: () => routeStreamGenerator(options) };
}

async function* routeStreamGenerator(options: GenerateOptions): AsyncGenerator<GenerateChunk> {
  const candidates = buildCandidateList(options);
  if (candidates.length === 0) throw noProviderError();
  validatePrompt(options.prompt, candidates[0] as ExpoAIProvider);

  const { adapter, provider, usedFallback } = await selectAvailableAdapter(options);
  const req = normalizeRequest(options);

  const source: StreamSource = {
    provider,
    usedFallback,
    signal: req.signal,
    startNativeStream: adapter.stream ? (handlers) => adapter.stream!(req, handlers) : null,
    generateOnce: () => adapter.generate(req),
  };
  yield* createStreamIterable(source);
}

/* ------------------------------------------------------------------ */
/* Task helpers (summarize / rewrite / proofread)                     */
/* ------------------------------------------------------------------ */

type TaskKind = 'summarize' | 'rewrite' | 'proofread';

export async function routeTask(
  kind: TaskKind,
  options: {
    text: string;
    provider?: ExpoAIProvider;
    fallback?: ExpoAIFallback;
    sensitive?: boolean;
    signal?: AbortSignal;
    style?: string;
    length?: string;
  },
): Promise<GenerateResult> {
  const candidates = buildCandidateList(options);
  if (candidates.length === 0) throw noProviderError();
  validatePrompt(options.text, candidates[0] as ExpoAIProvider);
  const primary = intendedPrimaryProvider(options.provider, candidates);

  const baseReq: NormalizedGenerateRequest = { prompt: options.text };
  if (options.signal) baseReq.signal = options.signal;
  let lastError: ExpoAIError | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i] as ExpoAIProvider;
    const adapter = getAdapter(provider);
    if (!adapter) continue;

    const availability = await adapter.getAvailability();
    if (!availability.available) {
      lastError = unavailableError(provider, availability);
      continue;
    }

    try {
      const native = adapter[kind];
      const exec: Promise<AdapterGenerateResult> =
        typeof native === 'function'
          ? native.call(adapter, {
              ...baseReq,
              text: options.text,
              ...(kind === 'rewrite' && options.style ? { style: options.style } : {}),
              ...(kind === 'summarize' && options.length ? { length: options.length } : {}),
            })
          : // Emulate the task with a prompt.
            adapter.generate({ ...baseReq, prompt: taskPrompt(kind, options) });
      const result = await withSignal(exec, options.signal, provider);
      return finalizeResult(result, provider, provider !== primary);
    } catch (error) {
      const normalized = ExpoAIError.from(error, provider);
      lastError = normalized;
      if (!normalized.fallbackRecommended) throw normalized;
    }
  }
  throw lastError ?? noProviderError();
}

function taskPrompt(
  kind: TaskKind,
  options: { text: string; style?: string; length?: string },
): string {
  switch (kind) {
    case 'summarize': {
      const length = options.length ? ` Keep it ${options.length}.` : '';
      return `Summarize the following text.${length}\n\n${options.text}`;
    }
    case 'rewrite': {
      const style = options.style ? ` in a ${options.style} style` : '';
      return `Rewrite the following text${style}, preserving its meaning.\n\n${options.text}`;
    }
    case 'proofread':
      return `Proofread the following text and return a corrected version. Fix spelling, grammar, and punctuation without changing the meaning.\n\n${options.text}`;
    default:
      return options.text;
  }
}

export { normalizeRequest };
