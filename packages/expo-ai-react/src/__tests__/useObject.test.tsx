import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type JSONSchema, clearAdapters, registerAdapter } from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';

import { useObject } from '../useObject.js';

beforeEach(() => clearAdapters());
afterEach(() => clearAdapters());

const personSchema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
  required: ['name', 'age'],
};

describe('useObject', () => {
  it('streams partials and lands on the validated object', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: '{"name": "Ada", "age": 36}',
        supportsStreaming: true,
      }),
    );

    const { result } = renderHook(() => useObject<{ name: string; age: number }>());
    await act(async () => {
      await result.current.submit({ prompt: 'a person', schema: personSchema });
    });

    expect(result.current.object).toEqual({ name: 'Ada', age: 36 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces install guidance when no provider is registered', async () => {
    const { result } = renderHook(() => useObject());
    await act(async () => {
      await result.current.submit({ prompt: 'a person', schema: personSchema });
    });

    expect(result.current.error?.code).toBe('UNAVAILABLE');
    expect(result.current.error?.message).toContain('Install and import a provider package');
  });

  it('reset() clears the object and error', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: '{"name": "Ada", "age": 36}',
        supportsStreaming: true,
      }),
    );

    const { result } = renderHook(() => useObject<{ name: string; age: number }>());
    await act(async () => {
      await result.current.submit({ prompt: 'a person', schema: personSchema, provider: 'cloud' });
    });
    expect(result.current.object).not.toBeNull();

    act(() => result.current.reset());
    expect(result.current.object).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
