/**
 * Bridges callback-style adapter streaming (or a single-shot generate) into the
 * public `AsyncIterable<GenerateChunk>`. Used by both the router and sessions.
 */

import type { AdapterGenerateResult, AdapterStreamHandlers, StreamHandle } from './adapter.js';
import { AsyncQueue } from './async-queue.js';
import { ExpoAIError } from './errors.js';
import { privacyInfoForProvider } from './privacy.js';
import { finalizeResult } from './result.js';
import type { ExpoAIProvider, GenerateChunk } from './types.js';

export type StreamSource = {
  provider: ExpoAIProvider;
  usedFallback: boolean;
  signal?: AbortSignal;
  /** Start native streaming, wiring our handlers. Return null when unsupported. */
  startNativeStream: ((handlers: AdapterStreamHandlers) => StreamHandle) | null;
  /** Single-shot generation, used when native streaming is unavailable. */
  generateOnce: () => Promise<AdapterGenerateResult>;
};

export function createStreamIterable(source: StreamSource): AsyncIterable<GenerateChunk> {
  return { [Symbol.asyncIterator]: () => streamGenerator(source) };
}

async function* streamGenerator(source: StreamSource): AsyncGenerator<GenerateChunk> {
  const { provider, usedFallback } = source;
  const privacy = privacyInfoForProvider(provider);

  if (source.signal?.aborted) {
    throw new ExpoAIError({ code: 'CANCELLED', provider });
  }

  // Emulated streaming: one generation, surfaced as start → delta → done.
  if (!source.startNativeStream) {
    let result: AdapterGenerateResult;
    try {
      result = await raceAbort(source.generateOnce(), source.signal, provider);
    } catch (error) {
      throw ExpoAIError.from(error, provider);
    }
    if (source.signal?.aborted) {
      throw new ExpoAIError({ code: 'CANCELLED', provider });
    }
    yield { type: 'start', provider, privacy };
    if (result.text.length > 0) yield { type: 'delta', text: result.text };
    yield { type: 'done', result: finalizeResult(result, provider, usedFallback) };
    return;
  }

  const queue = new AsyncQueue<GenerateChunk>();
  const handlers: AdapterStreamHandlers = {
    onStart: () => queue.push({ type: 'start', provider, privacy }),
    onDelta: (text) => queue.push({ type: 'delta', text }),
    onDone: (result) => {
      queue.push({ type: 'done', result: finalizeResult(result, provider, usedFallback) });
      queue.close();
    },
    onError: (error) => queue.fail(ExpoAIError.from(error, provider)),
  };

  const handle = source.startNativeStream(handlers);
  const onAbort = () => {
    handle.cancel();
    // Discard any buffered chunks so nothing is emitted after cancellation.
    queue.fail(new ExpoAIError({ code: 'CANCELLED', provider }), true);
  };
  if (source.signal) source.signal.addEventListener('abort', onAbort, { once: true });

  try {
    let started = false;
    for await (const chunk of queue) {
      if (chunk.type === 'start') {
        if (started) continue; // suppress a duplicate/late start
        started = true;
        yield chunk;
        continue;
      }
      if (!started) {
        // Synthesize a start for adapters that emit deltas before onStart.
        started = true;
        yield { type: 'start', provider, privacy };
      }
      yield chunk;
    }
  } finally {
    source.signal?.removeEventListener('abort', onAbort);
  }
}

/** Reject with CANCELLED if `signal` aborts before `promise` settles. */
function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  provider: ExpoAIProvider,
): Promise<T> {
  if (!signal) return promise;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const fail = () => reject(new ExpoAIError({ code: 'CANCELLED', provider }));
      if (signal.aborted) fail();
      else signal.addEventListener('abort', fail, { once: true });
    }),
  ]);
}
