/**
 * Provider router (docs/prd.md §13).
 *
 * Routing rules:
 *   1. The app's privacy policy is a hard ceiling, even over an explicit provider.
 *   2. Try the requested provider (or the default priority order).
 *   3. Off-device providers (PCC, cloud) are used only when explicitly requested
 *      or when `fallback` is not `'none'`.
 *   4. A sensitive prompt reaches a third-party cloud only when explicitly
 *      requested or with `fallback: 'cloud'`.
 *   5. Stamp provider + privacy metadata onto every result.
 */

import type {
  AdapterGenerateResult,
  AdapterUsage,
  ExpoAIAdapter,
  NormalizedGenerateRequest,
  NormalizedObjectRequest,
} from './adapter.js';
import { AsyncQueue } from './async-queue.js';
import { ExpoAIError, type ExpoAIErrorCode } from './errors.js';
import {
  getPrivacyPolicy,
  isProviderAllowed,
  privacyModeForProvider,
  providerSendsPromptOffDevice,
} from './privacy.js';
import { getAdapter, getOrderedProviders, getRegisteredProviders, hasAdapter } from './registry.js';
import { finalizeObjectResult, finalizeResult } from './result.js';
import { createStreamIterable, type StreamSource } from './stream-bridge.js';
import {
  buildSchemaPrompt,
  generateValidatedObject,
  parsePartialJson,
  type GenerateValidatedObjectOptions,
} from './structured-output.js';
import type {
  DeepPartial,
  ExpoAIAvailability,
  ExpoAIProvider,
  ExpoAIRoutingOptions,
  ExpoAIUnavailableReason,
  GenerateChunk,
  GenerateObjectOptions,
  GenerateOptions,
  GenerateResult,
  StreamObjectOptions,
  StreamObjectResult,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Candidate selection                                                */
/* ------------------------------------------------------------------ */

/**
 * The ordered, gated list of providers to attempt for a request. Filtered to
 * registered adapters and to providers the privacy policy and fallback permit.
 */
export function buildCandidateList(options: ExpoAIRoutingOptions): ExpoAIProvider[] {
  const policy = getPrivacyPolicy();
  const explicit =
    options.provider && options.provider !== 'system-preferred' ? options.provider : undefined;
  const fallback = options.fallback ?? 'none';
  const sensitive = options.sensitive === true || policy.sensitiveByDefault === true;
  const ordered = getOrderedProviders();

  // With no explicit provider, every on-device provider is considered by
  // priority regardless of `fallback`: moving between on-device providers is
  // not "falling back" in the privacy sense.
  const base: ExpoAIProvider[] = explicit
    ? [explicit, ...(fallback !== 'none' ? ordered.filter((p) => p !== explicit) : [])]
    : ordered;

  return base.filter((provider, index) => {
    // The policy is a hard ceiling, even over an explicit provider.
    if (!hasAdapter(provider) || !isProviderAllowed(provider, policy)) return false;
    // An explicit provider is not a silent route.
    if (explicit === provider && index === 0) return true;
    const mode = privacyModeForProvider(provider);
    if (mode === 'on-device') return true;
    // Off-device (PCC or third-party cloud) only by opt-in fallback.
    if (fallback === 'none') return false;
    // A sensitive prompt reaches a third-party cloud only with fallback 'cloud';
    // Apple Private Cloud Compute stays permitted (docs/prd.md §13.3, §14).
    return !(sensitive && mode === 'third-party-cloud' && fallback !== 'cloud');
  });
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
  if (options.reasoningLevel !== undefined) req.reasoningLevel = options.reasoningLevel;
  if (options.metadata !== undefined) req.metadata = options.metadata;
  if (options.signal !== undefined) req.signal = options.signal;
  if (options.model !== undefined) req.model = options.model;
  return req;
}

/** Unavailable reasons that have a more specific error code than UNAVAILABLE. */
const REASON_CODES: Partial<Record<ExpoAIUnavailableReason, ExpoAIErrorCode>> = {
  unsupported_locale: 'UNSUPPORTED_LOCALE',
  quota_exhausted: 'QUOTA_EXHAUSTED',
  entitlement_missing: 'ENTITLEMENT_MISSING',
};

function unavailableError(provider: ExpoAIProvider, availability: ExpoAIAvailability): ExpoAIError {
  const reason = availability.reasonUnavailable;
  return new ExpoAIError({
    code: (reason && REASON_CODES[reason]) ?? 'UNAVAILABLE',
    provider,
    message: reason
      ? `Provider ${provider} is unavailable: ${reason}`
      : `Provider ${provider} is unavailable.`,
  });
}

/**
 * No provider could serve the request. This is the zero-config first-run signal,
 * so the message guides the developer to the missing step. Two distinct cases:
 *
 *   - Nothing registered at all → they haven't installed/imported a provider
 *     package yet (provider packages self-register on import).
 *   - Providers registered but all gated out → name the causes: the privacy
 *     policy, and off-device providers gated by `fallback` / `sensitive`.
 */
function noProviderError(): ExpoAIError {
  const registered = getRegisteredProviders();
  const blocked = registered.filter((p) => !isProviderAllowed(p));
  const offDevice = registered.filter(
    (p) => isProviderAllowed(p) && providerSendsPromptOffDevice(p),
  );
  const message =
    registered.length === 0
      ? 'No AI provider is registered. Install and import a provider package — ' +
        '"@stewmore/expo-ai-apple-foundation-models" (iOS) or ' +
        '"@stewmore/expo-ai-android-aicore" (Android) — then rebuild the app ' +
        '(e.g. `npx expo prebuild`). Provider packages self-register on import.'
      : `No eligible AI provider for this request. Registered provider(s) ` +
        `[${registered.join(', ')}] were all excluded.` +
        (blocked.length > 0
          ? ` [${blocked.join(', ')}] excluded by the privacy policy (see ExpoAI.setPrivacyPolicy).`
          : '') +
        (offDevice.length > 0
          ? ` Off-device provider(s) [${offDevice.join(', ')}] are used only when requested ` +
            "explicitly or with fallback: 'cloud' | 'any'; a sensitive prompt reaches a " +
            "third-party cloud only with fallback: 'cloud'."
          : '');
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
 * Run `start` and reject with CANCELLED if `signal` is (or becomes) aborted
 * before it settles. An already-aborted signal never starts the work. Native
 * generation can't always be torn down, but the JS caller still gets a prompt
 * CANCELLED instead of waiting for a result it no longer wants.
 */
function withSignal<T>(
  start: () => Promise<T>,
  signal: AbortSignal | undefined,
  provider: ExpoAIProvider,
): Promise<T> {
  if (!signal) return start();
  if (signal.aborted) return Promise.reject(new ExpoAIError({ code: 'CANCELLED', provider }));
  const promise = start();
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
export async function selectAvailableAdapter(
  options: ExpoAIRoutingOptions,
): Promise<{ adapter: ExpoAIAdapter; provider: ExpoAIProvider; usedFallback: boolean }> {
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
      const result = await withSignal(() => adapter.generate(req), options.signal, provider);
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

    try {
      const validated = await withSignal(
        () => generateValidatedObject(validatedObjectOptions(adapter, provider, options, baseReq)),
        options.signal,
        provider,
      );
      return {
        object: validated.object,
        result: finalizeObjectResult(validated, provider, provider !== primary),
      };
    } catch (error) {
      const normalized = ExpoAIError.from(error, provider);
      lastError = normalized;
      if (!normalized.fallbackRecommended) throw normalized;
    }
  }
  throw lastError ?? noProviderError();
}

/** The validate→repair options for one candidate (shared by generateObject and streamObject). */
function validatedObjectOptions(
  adapter: ExpoAIAdapter,
  provider: ExpoAIProvider,
  options: GenerateObjectOptions,
  baseReq: NormalizedGenerateRequest,
): GenerateValidatedObjectOptions {
  const objectReq: NormalizedObjectRequest = { ...baseReq, schema: options.schema };
  if (options.schemaName !== undefined) objectReq.schemaName = options.schemaName;
  return {
    provider,
    schema: options.schema,
    basePrompt: options.prompt,
    mode: options.structuredOutput ?? 'auto',
    ...(options.schemaName !== undefined ? { schemaName: options.schemaName } : {}),
    ...(options.maxRepairAttempts !== undefined
      ? { maxRepairAttempts: options.maxRepairAttempts }
      : {}),
    generateText: (prompt) => adapter.generate({ ...baseReq, prompt }),
    ...(adapter.generateObject ? { nativeObject: () => adapter.generateObject!(objectReq) } : {}),
  };
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
    // 'native' runs guided generation once (no token stream); 'auto' and
    // 'emulated' stream the schema prompt and validate the streamed text.
    const native = options.structuredOutput === 'native';

    let accumulated = '';
    let lastSnapshot: string | undefined;
    let seedUsage: AdapterUsage | undefined;
    if (!native) {
      const schemaPrompt = buildSchemaPrompt(options.prompt, options.schema, options.schemaName);
      const streamReq: NormalizedGenerateRequest = { ...baseReq, prompt: schemaPrompt };
      const source: StreamSource = {
        provider,
        usedFallback,
        signal: streamReq.signal,
        startNativeStream: adapter.stream
          ? (handlers) => adapter.stream!(streamReq, handlers)
          : null,
        generateOnce: () => adapter.generate(streamReq),
      };
      try {
        for await (const chunk of createStreamIterable(source)) {
          if (chunk.type === 'done') seedUsage = chunk.result.usage;
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
    }
    // textQueue is closed only after the whole operation succeeds (below), so a
    // failure during validation/repair — or a late abort — rejects textStream
    // too, honoring the StreamObjectResult contract (all views fail together).

    try {
      const validated = await withSignal(
        () =>
          generateValidatedObject({
            ...validatedObjectOptions(adapter, provider, options, baseReq),
            ...(native ? {} : { seedText: accumulated, seedUsage }),
          }),
        options.signal,
        provider,
      );

      if (native) textQueue.push(validated.raw);
      // Ensure the final partial equals the validated object.
      if (JSON.stringify(validated.object) !== lastSnapshot) {
        partialQueue.push(validated.object as DeepPartial<T>);
      }
      partialQueue.close();
      textQueue.close();

      resolveObject(validated.object as T);
      resolveResult(finalizeObjectResult(validated, provider, usedFallback));
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
  options: ExpoAIRoutingOptions & {
    text: string;
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
      const exec = (): Promise<AdapterGenerateResult> =>
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
