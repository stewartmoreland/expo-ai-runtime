import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExpoAI,
  type ExpoAIError,
  type GenerateOptions,
  type GenerateResult,
} from '@stewmore/expo-ai-core';

import { isCancelled, toError, useIsMounted } from './internal.js';

export type UseGenerateResult = {
  /** One-shot generation. Resolves the result, or undefined on error/cancel. */
  generate: (options: GenerateOptions) => Promise<GenerateResult | undefined>;
  /** Streamed generation. `text` accumulates as tokens arrive. */
  stream: (options: GenerateOptions) => Promise<GenerateResult | undefined>;
  /** Generated text (accumulates during `stream`, set whole by `generate`). */
  text: string;
  /** Final result with provider + privacy metadata, once complete. */
  result: GenerateResult | null;
  isLoading: boolean;
  error: ExpoAIError | null;
  /** Abort the in-flight request. Cancellation is not surfaced as an error. */
  stop: () => void;
  /** Clear text/result/error back to the initial state. */
  reset: () => void;
};

/**
 * Imperatively generate text — one-shot via `generate` or token-streamed via
 * `stream`. Owns an AbortController so `stop()` (and unmount) cancel cleanly.
 */
export function useGenerate(): UseGenerateResult {
  const [text, setText] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ExpoAIError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useIsMounted();

  // Abort any in-flight request when the component unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    setText('');
    setResult(null);
    setError(null);
  }, []);

  const begin = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setText('');
    setResult(null);
    setError(null);
    setIsLoading(true);
    return controller;
  }, []);

  const finish = useCallback(
    (controller: AbortController) => {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mounted.current) setIsLoading(false);
    },
    [mounted],
  );

  const generate = useCallback(
    async (options: GenerateOptions): Promise<GenerateResult | undefined> => {
      const controller = begin();
      try {
        const generated = await ExpoAI.generate({ ...options, signal: controller.signal });
        if (mounted.current && controllerRef.current === controller) {
          setResult(generated);
          setText(generated.text);
        }
        return generated;
      } catch (caught) {
        const normalized = toError(caught);
        if (mounted.current && !isCancelled(normalized)) setError(normalized);
        return undefined;
      } finally {
        finish(controller);
      }
    },
    [begin, finish, mounted],
  );

  const stream = useCallback(
    async (options: GenerateOptions): Promise<GenerateResult | undefined> => {
      const controller = begin();
      let final: GenerateResult | undefined;
      try {
        for await (const chunk of ExpoAI.stream({ ...options, signal: controller.signal })) {
          if (controllerRef.current !== controller) break;
          if (chunk.type === 'delta') {
            if (mounted.current) setText((current) => current + chunk.text);
          } else if (chunk.type === 'done') {
            final = chunk.result;
            if (mounted.current) setResult(chunk.result);
          }
        }
        return final;
      } catch (caught) {
        const normalized = toError(caught);
        if (mounted.current && !isCancelled(normalized)) setError(normalized);
        return undefined;
      } finally {
        finish(controller);
      }
    },
    [begin, finish, mounted],
  );

  return { generate, stream, text, result, isLoading, error, stop, reset };
}
