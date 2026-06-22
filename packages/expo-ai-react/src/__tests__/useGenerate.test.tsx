import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type GenerateResult, clearAdapters, registerAdapter } from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';

import { useGenerate } from '../useGenerate.js';

beforeEach(() => clearAdapters());
afterEach(() => clearAdapters());

describe('useGenerate', () => {
  it('generates one-shot text with provider metadata', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: 'hello there' }),
    );

    const { result } = renderHook(() => useGenerate());
    await act(async () => {
      await result.current.generate({ prompt: 'hi' });
    });

    expect(result.current.text).toBe('hello there');
    expect(result.current.result?.provider).toBe('apple-foundation-models');
    expect(result.current.result?.privacy.privacyMode).toBe('on-device');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('accumulates deltas while streaming', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: 'one two three',
        supportsStreaming: true,
      }),
    );

    const { result } = renderHook(() => useGenerate());
    await act(async () => {
      await result.current.stream({ prompt: 'hi', provider: 'cloud' });
    });

    expect(result.current.text).toBe('one two three');
    expect(result.current.result?.provider).toBe('cloud');
  });

  it('surfaces a non-cancellation error', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', throwError: { code: 'SAFETY_BLOCKED' } }),
    );

    const { result } = renderHook(() => useGenerate());
    await act(async () => {
      await result.current.generate({ prompt: 'hi', provider: 'cloud' });
    });

    expect(result.current.error?.code).toBe('SAFETY_BLOCKED');
    expect(result.current.isLoading).toBe(false);
  });

  it('stop() cancels a stream without surfacing an error', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: 'one two three four five',
        supportsStreaming: true,
        delayMs: 25,
      }),
    );

    const { result } = renderHook(() => useGenerate());
    let streamPromise: Promise<GenerateResult | undefined> | undefined;
    act(() => {
      streamPromise = result.current.stream({ prompt: 'hi', provider: 'cloud' });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => result.current.stop());
    await act(async () => {
      await streamPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('reset() clears text, result, and error', async () => {
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'hi' }));
    const { result } = renderHook(() => useGenerate());
    await act(async () => {
      await result.current.generate({ prompt: 'hi', provider: 'cloud' });
    });
    expect(result.current.text).toBe('hi');

    act(() => result.current.reset());
    expect(result.current.text).toBe('');
    expect(result.current.result).toBeNull();
  });
});
