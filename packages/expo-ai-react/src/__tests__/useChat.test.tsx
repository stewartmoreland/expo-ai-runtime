import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearAdapters, registerAdapter } from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';

import { useChat } from '../useChat.js';

beforeEach(() => clearAdapters());
afterEach(() => clearAdapters());

describe('useChat', () => {
  it('appends a user turn and streams the assistant reply', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: 'I am well thanks',
        supportsStreaming: true,
      }),
    );

    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.append('how are you?');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'how are you?' });
    expect(result.current.messages[1]?.role).toBe('assistant');
    expect(result.current.messages[1]?.content).toContain('well');
    expect(result.current.isLoading).toBe(false);
  });

  it('uses the current input when append is called with no argument', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', respondWith: 'reply', supportsStreaming: true }),
    );

    const { result } = renderHook(() => useChat({ provider: 'cloud' }));
    act(() => result.current.setInput('hello'));
    await act(async () => {
      await result.current.append();
    });

    expect(result.current.messages[0]?.content).toBe('hello');
    expect(result.current.input).toBe(''); // cleared after sending
  });

  it('ignores an empty append', async () => {
    registerAdapter(createMockAdapter({ provider: 'cloud', supportsStreaming: true }));
    const { result } = renderHook(() => useChat({ provider: 'cloud' }));

    await act(async () => {
      await result.current.append('   ');
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('reset() clears the transcript', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', respondWith: 'reply', supportsStreaming: true }),
    );

    const { result } = renderHook(() => useChat({ provider: 'cloud' }));
    await act(async () => {
      await result.current.append('hi');
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.reset();
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('surfaces a non-cancellation error and drops the empty assistant bubble', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', throwError: { code: 'SAFETY_BLOCKED' } }),
    );

    const { result } = renderHook(() => useChat({ provider: 'cloud' }));
    await act(async () => {
      await result.current.append('hi');
    });

    await waitFor(() => expect(result.current.error?.code).toBe('SAFETY_BLOCKED'));
    expect(result.current.isLoading).toBe(false);
    // The user message stays; the never-filled assistant placeholder is removed.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'hi' });
  });

  it('does not leave an empty assistant bubble when no provider is registered', async () => {
    const { result } = renderHook(() => useChat());
    await act(async () => {
      await result.current.append('hi');
    });

    expect(result.current.error?.code).toBe('UNAVAILABLE');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.role).toBe('user');
  });
});
