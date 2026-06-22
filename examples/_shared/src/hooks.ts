import { ExpoAI, type ExpoAICapabilities, type ExpoAIProviderInfo } from '@stewmore/expo-ai-core';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads capabilities of the best provider plus the full provider list. */
export function useCapabilities() {
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<ExpoAICapabilities | null>(null);
  const [providers, setProviders] = useState<ExpoAIProviderInfo[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [caps, list] = await Promise.all([ExpoAI.getCapabilities(), ExpoAI.listProviders()]);
      if (!mounted.current) return;
      setCapabilities(caps);
      setProviders(list);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, capabilities, providers, refresh };
}
