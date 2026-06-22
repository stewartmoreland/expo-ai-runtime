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
import { AsyncQueue } from './async-queue.js';
import { ExpoAIError } from './errors.js';
import { privacyModeForProvider } from './privacy.js';
import { getAdapter, getRegisteredProviders, hasAdapter } from './registry.js';
import { finalizeResult } from './result.js';
import { createStreamIterable, type StreamSource } from './stream-bridge.js';
import { buildSchemaPrompt, generateValidatedObject, parsePartialJson } from './structured-output.js';
import {
  defaultProviderPriority,
  type DeepPartial,
  type ExpoAIAvailability,
  type ExpoAIFallback,
  type ExpoAIProvider,
  type GenerateChunk,
  type GenerateObjectOptions,
  type GenerateOptions,
  type GenerateResult,
  type StreamObjectOptions,
  type StreamObjectResult,
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

/**
 * No provider could serve the request. This is the zero-config first-run signal,
 * so the message guides the developer to the missing step. Two distinct cases:
 *
 *   - Nothing registered at all → they haven't installed/imported a provider
 *     package yet (provider packages self-register on import).
 *   - Providers registered but all gated out by the routing policy (e.g. only a
 *     cloud provider is registered while `fallback` is `'none'`, or a sensitive
 *     prompt was blocked from a third-party cloud) → point at the policy knob.
 */
function noProviderError(): ExpoAIError {
  const registered = getRegisteredProviders();
  const message =
    registered.length === 0
      ? 'No AI provider is registered. Install and import a provider package — ' +
        '"@stewmore/expo-ai-apple-foundation-models" (iOS), ' +
        '"@stewmore/expo-ai-android-aicore" (Android), or ' +
        '"@stewmore/expo-ai-cloud" (cloud fallback) — then rebuild the app ' +
        '(e.g. `npx expo prebuild`). Provider packages self-register on import.'
      : `No eligible AI provider for this request. Registered provider(s) ` +
        `[${registered.join(', ')}] were all excluded by the routing policy. ` +
        "If you meant to use the cloud, pass fallback: 'cloud'; note a prompt " +
        'marked sensitive is never sent to a third-party cloud.';
  return new ExpoAIError({
    code: 'UNAVAILABLE',
    provider: 'none',
    message,
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
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ExpoAIError({ code: 'CANCELLED', provider }));
    signal.addEventListener('abort', onAbort, { once: true });
    // Remove the listener once the underlying work settles, so a reused signal
    // (a "cancel the whole screen" controller) doesn't accumulate listeners.
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
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
/* streamObject                                                       */
/* ------------------------------------------------------------------ */

/**
 * Stream a structured object: surface best-effort partial snapshots as tokens
 * arrive, then resolve the validated (repaired) final object. Composes the same
 * provider selection + schema prompt as {@link routeGenerateObjectWithMeta} with
 * the streaming bridge; the streamed text seeds attempt 0 of the validate→repair
 * loop, so repair only re-generates when the streamed JSON does not validate.
 */
export function routeStreamObject<T = unknown>(
  options: StreamObjectOptions,
): StreamObjectResult<T> {
  const partialQueue = new AsyncQueue<DeepPartial<T>>();
  const textQueue = new AsyncQueue<string>();

  let resolveObject!: (value: T) => void;
  let rejectObject!: (error: unknown) => void;
  const objectPromise = new Promise<T>((resolve, reject) => {
    resolveObject = resolve;
    rejectObject = reject;
  });
  let resolveResult!: (value: GenerateResult) => void;
  let rejectResult!: (error: unknown) => void;
  const resultPromise = new Promise<GenerateResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // A consumer may read only one of the four views; keep the unread promises
  // from surfacing as unhandled rejections.
  objectPromise.catch(() => {});
  resultPromise.catch(() => {});

  const fail = (error: unknown, provider: ExpoAIProvider): void => {
    const normalized = ExpoAIError.from(error, provider);
    rejectObject(normalized);
    rejectResult(normalized);
    textQueue.fail(normalized, true);
    partialQueue.fail(normalized, true);
  };

  void (async () => {
    const candidates = buildCandidateList(options);
    if (candidates.length === 0) {
      fail(noProviderError(), 'none');
      return;
    }
    try {
      validatePrompt(options.prompt, candidates[0] as ExpoAIProvider);
    } catch (error) {
      fail(error, candidates[0] as ExpoAIProvider);
      return;
    }

    let selected: { adapter: ExpoAIAdapter; provider: ExpoAIProvider; usedFallback: boolean };
    try {
      selected = await selectAvailableAdapter(options);
    } catch (error) {
      fail(error, (error as ExpoAIError).provider ?? 'none');
      return;
    }
    const { adapter, provider, usedFallback } = selected;

    const baseReq = normalizeRequest(options);
    const schemaPrompt = buildSchemaPrompt(options.prompt, options.schema, options.schemaName);
    const streamReq: NormalizedGenerateRequest = { ...baseReq, prompt: schemaPrompt };

    const source: StreamSource = {
      provider,
      usedFallback,
      signal: streamReq.signal,
      startNativeStream: adapter.stream ? (handlers) => adapter.stream!(streamReq, handlers) : null,
      generateOnce: () => adapter.generate(streamReq),
    };

    let accumulated = '';
    let lastSnapshot: string | undefined;
    try {
      for await (const chunk of createStreamIterable(source)) {
        if (chunk.type !== 'delta') continue;
        accumulated += chunk.text;
        textQueue.push(chunk.text);
        const partial = parsePartialJson(accumulated);
        if (partial === null) continue;
        const serialized = JSON.stringify(partial);
        if (serialized !== lastSnapshot) {
          lastSnapshot = serialized;
          partialQueue.push(partial as DeepPartial<T>);
        }
      }
    } catch (error) {
      fail(error, provider);
      return;
    }
    // textQueue is closed only after the whole operation succeeds (below), so a
    // failure during validation/repair — or a late abort — rejects textStream
    // too, honoring the StreamObjectResult contract (all views fail together).

    const objectReq: NormalizedObjectRequest = { ...baseReq, schema: options.schema };
    if (options.schemaName !== undefined) objectReq.schemaName = options.schemaName;

    try {
      const validated = await withSignal(
        generateValidatedObject({
          provider,
          schema: options.schema,
          basePrompt: options.prompt,
          seedText: accumulated,
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

      // Ensure the final partial equals the validated object.
      if (JSON.stringify(validated.object) !== lastSnapshot) {
        partialQueue.push(validated.object as DeepPartial<T>);
      }
      partialQueue.close();
      textQueue.close();

      const result = finalizeResult(
        { text: validated.raw, raw: validated.object },
        provider,
        usedFallback,
      );
      resolveObject(validated.object as T);
      resolveResult(result);
    } catch (error) {
      fail(error, provider);
    }
  })();

  return {
    partialObjectStream: partialQueue,
    textStream: textQueue,
    object: objectPromise,
    result: resultPromise,
  };
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
