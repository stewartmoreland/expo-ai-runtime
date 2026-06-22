import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExpoAI,
  type ExpoAIAvailability,
  type ExpoAICapabilities,
  type ExpoAIError,
  type ExpoAIProviderInfo,
} from '@stewmore/expo-ai-core';

import { toError, useIsMounted } from './internal.js';

export type UseCapabilitiesResult = {
  /** Capabilities of the best currently-available provider, or null while loading. */
  capabilities: ExpoAICapabilities | null;
  /** Availability of the best currently-available provider. */
  availability: ExpoAIAvailability | null;
  /** Every registered provider and its capabilities. */
  providers: ExpoAIProviderInfo[] | null;
  loading: boolean;
  error: ExpoAIError | null;
  /** Re-query availability/capabilities (e.g. after the user enables a model). */
  refresh: () => void;
};

type State = Omit<UseCapabilitiesResult, 'refresh'>;

const INITIAL: State = {
  capabilities: null,
  availability: null,
  providers: null,
  loading: true,
  error: null,
};

/**
 * Query what the runtime can do on this device. Resolves capabilities,
 * availability, and the full provider list on mount; call `refresh()` to re-query
 * (capabilities can change when the user toggles Apple Intelligence, finishes a
 * model download, etc.).
 */
export function useCapabilities(): UseCapabilitiesResult {
  const [state, setState] = useState<State>(INITIAL);
  const mounted = useIsMounted();
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    Promise.all([ExpoAI.getCapabilities(), ExpoAI.getAvailability(), ExpoAI.listProviders()])
      .then(([capabilities, availability, providers]) => {
        // Ignore a resolution superseded by a newer refresh, or after unmount.
        if (!mounted.current || id !== requestId.current) return;
        setState({ capabilities, availability, providers, loading: false, error: null });
      })
      .catch((caught) => {
        if (!mounted.current || id !== requestId.current) return;
        setState((prev) => ({ ...prev, loading: false, error: toError(caught) }));
      });
  }, [mounted]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
