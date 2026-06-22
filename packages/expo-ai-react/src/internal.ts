/**
 * Small internals shared by the hooks. Kept dependency-free (react only) so the
 * package stays testable under jsdom and usable on web.
 */
import { useEffect, useRef } from 'react';

import { ExpoAIError } from '@stewmore/expo-ai-core';

/** A ref that is `true` while the component is mounted, for post-await guards. */
export function useIsMounted(): { readonly current: boolean } {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/** Normalize any thrown value to an ExpoAIError (provider unknown at this layer). */
export function toError(value: unknown): ExpoAIError {
  return ExpoAIError.from(value, 'none');
}

/** Stopping a request is intentional, not an error to surface to the UI. */
export function isCancelled(error: ExpoAIError): boolean {
  return error.code === 'CANCELLED';
}
