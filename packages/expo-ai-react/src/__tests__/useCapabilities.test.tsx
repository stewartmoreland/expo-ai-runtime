import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ExpoAI,
  clearAdapters,
  notifyAvailabilityChange,
  registerAdapter,
} from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';

import { useCapabilities } from '../useCapabilities.js';

beforeEach(() => clearAdapters());
afterEach(() => clearAdapters());

describe('useCapabilities', () => {
  it('resolves capabilities, availability, and providers', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));

    const { result } = renderHook(() => useCapabilities());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.capabilities?.provider).toBe('apple-foundation-models');
    expect(result.current.availability?.available).toBe(true);
    expect(result.current.providers?.map((p) => p.provider)).toContain('apple-foundation-models');
    expect(result.current.error).toBeNull();
  });

  it('reports an unavailable runtime cleanly when nothing is registered', async () => {
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.capabilities?.available).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('refresh() re-queries and picks up a newly registered provider', async () => {
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers).toEqual([]);

    registerAdapter(createMockAdapter({ provider: 'cloud' }));
    result.current.refresh();

    await waitFor(() =>
      expect(result.current.providers?.map((p) => p.provider)).toContain('cloud'),
    );
  });

  it('re-queries on availability change without a manual refresh', async () => {
    const config = { provider: 'apple-foundation-models' as const, available: true };
    registerAdapter(createMockAdapter(config));

    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.availability?.available).toBe(true));

    config.available = false;
    notifyAvailabilityChange('apple-foundation-models');
    await waitFor(() => expect(result.current.availability?.available).toBe(false));
  });

  it('removes the availability subscription on unmount', () => {
    const remove = vi.fn();
    const spy = vi.spyOn(ExpoAI, 'onAvailabilityChange').mockReturnValue({ remove });
    const { unmount } = renderHook(() => useCapabilities());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
