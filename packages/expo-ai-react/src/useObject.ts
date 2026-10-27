import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExpoAI,
  type DeepPartial,
  type ExpoAIError,
  type GenerateResult,
  type StreamObjectOptions,
} from '@stewmore/expo-ai-core';

import { isCancelled, toError, useIsMounted } from './internal.js';

export type UseObjectResult<T> = {
  /** Start streaming a structured object. Resolves the validated value and its result, or undefined. */
  submit: (
    options: StreamObjectOptions,
  ) => Promise<{ object: T; result: GenerateResult } | undefined>;
  /** Best-effort partial snapshot, growing as tokens arrive; the final validated value last. */
  object: DeepPartial<T> | null;
  /** Metadata (provider, privacy, usage) of the last completed object, or null. */
  result: GenerateResult | null;
  isLoading: boolean;
  error: ExpoAIError | null;
  /** Abort the in-flight stream. Cancellation is not surfaced as an error. */
  stop: () => void;
  /** Clear object/result/error back to the initial state. */
  reset: () => void;
};

/**
 * Stream a structured object into React state. `object` updates with each partial
 * snapshot as tokens arrive, then becomes the validated (repaired) final value.
 * Built on {@link ExpoAI.streamObject}.
 */
export function useObject<T = unknown>(): UseObjectResult<T> {
  const [object, setObject] = useState<DeepPartial<T> | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ExpoAIError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useIsMounted();

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setObject(null);
    setResult(null);
    setError(null);
  }, []);

  const submit = useCallback(
    async (
      options: StreamObjectOptions,
    ): Promise<{ object: T; result: GenerateResult } | undefined> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setObject(null);
      setResult(null);
      setError(null);
      setIsLoading(true);

      const isCurrent = () => controllerRef.current === controller;
      const handle = ExpoAI.streamObject<T>({ ...options, signal: controller.signal });
      try {
        for await (const partial of handle.partialObjectStream) {
          if (!isCurrent()) break;
          if (mounted.current) setObject(partial);
        }
        const [final, meta] = await Promise.all([handle.object, handle.result]);
        if (mounted.current && isCurrent()) {
          setObject(final as DeepPartial<T>);
          setResult(meta);
        }
        return { object: final, result: meta };
      } catch (caught) {
        const normalized = toError(caught);
        // Only the live submit may write state — a superseded one must not clobber it.
        if (mounted.current && isCurrent() && !isCancelled(normalized)) setError(normalized);
        return undefined;
      } finally {
        if (isCurrent()) {
          controllerRef.current = null;
          if (mounted.current) setIsLoading(false);
        }
      }
    },
    [mounted],
  );

  return { submit, object, result, isLoading, error, stop, reset };
}
