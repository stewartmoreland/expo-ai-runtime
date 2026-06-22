import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearAdapters, registerAdapter } from '@stewmore/expo-ai-core';
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
});
