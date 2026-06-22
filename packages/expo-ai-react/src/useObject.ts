import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExpoAI,
  type DeepPartial,
  type ExpoAIError,
  type StreamObjectOptions,
} from '@stewmore/expo-ai-core';

import { isCancelled, toError, useIsMounted } from './internal.js';

export type UseObjectResult<T> = {
  /** Start streaming a structured object. Resolves the validated value, or undefined. */
  submit: (options: StreamObjectOptions) => Promise<T | undefined>;
  /** Best-effort partial snapshot, growing as tokens arrive; the final validated value last. */
  object: DeepPartial<T> | null;
  isLoading: boolean;
  error: ExpoAIError | null;
  /** Abort the in-flight stream. Cancellation is not surfaced as an error. */
  stop: () => void;
  /** Clear object/error back to the initial state. */
  reset: () => void;
};

/**
 * Stream a structured object into React state. `object` updates with each partial
 * snapshot as tokens arrive, then becomes the validated (repaired) final value.
 * Built on {@link ExpoAI.streamObject}.
 */
export function useObject<T = unknown>(): UseObjectResult<T> {
  const [object, setObject] = useState<DeepPartial<T> | null>(null);
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
    setError(null);
  }, []);

  const submit = useCallback(
    async (options: StreamObjectOptions): Promise<T | undefined> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setObject(null);
      setError(null);
      setIsLoading(true);

      const handle = ExpoAI.streamObject<T>({ ...options, signal: controller.signal });
      try {
        for await (const partial of handle.partialObjectStream) {
          if (controllerRef.current !== controller) break;
          if (mounted.current) setObject(partial);
        }
        const final = await handle.object;
        if (mounted.current && controllerRef.current === controller) {
          setObject(final as DeepPartial<T>);
        }
        return final;
      } catch (caught) {
        const normalized = toError(caught);
        if (mounted.current && !isCancelled(normalized)) setError(normalized);
        return undefined;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        if (mounted.current) setIsLoading(false);
      }
    },
    [mounted],
  );

  return { submit, object, isLoading, error, stop, reset };
}
