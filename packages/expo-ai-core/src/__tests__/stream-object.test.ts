import { beforeEach, describe, expect, it } from 'vitest';

import { ExpoAI, clearAdapters, parsePartialJson, registerAdapter } from '../index.js';
import type { JSONSchema, StreamObjectResult } from '../index.js';
import { createMockAdapter } from '../testing.js';

beforeEach(() => clearAdapters());

const personSchema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
  required: ['name', 'age'],
};

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iterable) out.push(value);
  return out;
}

describe('parsePartialJson', () => {
  it('parses complete JSON', () => {
    expect(parsePartialJson('{"name":"Ada","age":36}')).toEqual({ name: 'Ada', age: 36 });
  });

  it('completes an incomplete string value', () => {
    expect(parsePartialJson('{"name":"Ad')).toEqual({ name: 'Ad' });
  });

  it('drops a half-typed key (no value yet)', () => {
    expect(parsePartialJson('{"name":"Ada","ag')).toEqual({ name: 'Ada' });
  });

  it('drops a dangling colon (key with no value)', () => {
    expect(parsePartialJson('{"name":"Ada","age":')).toEqual({ name: 'Ada' });
  });

  it('completes a nested object', () => {
    expect(parsePartialJson('{"a":{"b":1')).toEqual({ a: { b: 1 } });
  });

  it('completes an incomplete array', () => {
    expect(parsePartialJson('[1, 2, 3')).toEqual([1, 2, 3]);
  });

  it('handles a trailing comma in an array', () => {
    expect(parsePartialJson('[1, 2,')).toEqual([1, 2]);
  });

  it('drops a lone trailing escape backslash', () => {
    expect(parsePartialJson('{"path":"a\\\\b\\')).toEqual({ path: 'a\\b' });
  });

  it('finds JSON after a markdown fence prefix', () => {
    expect(parsePartialJson('```json\n{"name":"Ada"')).toEqual({ name: 'Ada' });
  });

  it('ignores leading prose before the object', () => {
    expect(parsePartialJson('Here you go: {"name":"Ada"}')).toEqual({ name: 'Ada' });
  });

  it('returns {} for an object opener only', () => {
    expect(parsePartialJson('{')).toEqual({});
  });

  it('returns null when there is no structure', () => {
    expect(parsePartialJson('not json at all')).toBeNull();
  });
});

describe('ExpoAI.streamObject', () => {
  it('streams growing partial snapshots that converge on the validated object', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        // Spaced so the mock streams it as several tokens, not one.
        respondWith: '{"name": "Ada", "age": 36}',
        supportsStreaming: true,
      }),
    );

    const handle: StreamObjectResult<{ name: string; age: number }> = ExpoAI.streamObject({
      prompt: 'a person',
      schema: personSchema,
    });

    const partials = await collect(handle.partialObjectStream);
    const object = await handle.object;

    expect(object).toEqual({ name: 'Ada', age: 36 });
    expect(partials.length).toBeGreaterThan(1);
    // Snapshots only ever grow (key count is monotonic for this stream).
    const keyCounts = partials.map((p) => Object.keys(p).length);
    for (let i = 1; i < keyCounts.length; i++) {
      expect(keyCounts[i]).toBeGreaterThanOrEqual(keyCounts[i - 1] as number);
    }
    // The final partial equals the validated object.
    expect(partials[partials.length - 1]).toEqual(object);
  });

  it('carries provider + privacy metadata on the result', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: '{"name":"Ada","age":36}',
        supportsStreaming: true,
      }),
    );

    const handle = ExpoAI.streamObject({ prompt: 'a person', schema: personSchema });
    await collect(handle.partialObjectStream);
    const result = await handle.result;

    expect(result.provider).toBe('apple-foundation-models');
    expect(result.privacy.privacyMode).toBe('on-device');
    expect(result.privacy.sendsPromptOffDevice).toBe(false);
    expect(result.usedFallback).toBe(false);
  });

  it('exposes the raw text deltas via textStream', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: '{"name": "Ada", "age": 36}',
        supportsStreaming: true,
      }),
    );

    const handle = ExpoAI.streamObject({ prompt: 'a person', schema: personSchema });
    const text = (await collect(handle.textStream)).join('');
    await handle.object;
    expect(text).toContain('"name"');
    expect(text).toContain('Ada');
  });

  it('repairs invalid streamed JSON via a follow-up generation', async () => {
    let call = 0;
    const adapter = {
      provider: 'cloud',
      async getAvailability() {
        return { available: true, provider: 'cloud' };
      },
      async getCapabilities() {
        return { available: true, provider: 'cloud' };
      },
      async generate() {
        call += 1;
        // First call (streamed attempt 0) returns invalid JSON; repair returns valid.
        return { text: call === 1 ? '{"name":"Ada"}' : '{"name":"Ada","age":36}' };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const handle = ExpoAI.streamObject<{ name: string; age: number }>({
      prompt: 'a person',
      schema: personSchema,
      provider: 'cloud',
    });

    const object = await handle.object;
    expect(object).toEqual({ name: 'Ada', age: 36 });
    expect(call).toBeGreaterThanOrEqual(2); // streamed attempt + at least one repair
  });

  it('rejects object and throws from the streams when already aborted', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: '{"name":"Ada","age":36}',
        supportsStreaming: true,
      }),
    );

    const controller = new AbortController();
    controller.abort();
    const handle = ExpoAI.streamObject({
      prompt: 'a person',
      schema: personSchema,
      signal: controller.signal,
    });

    await expect(handle.object).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(collect(handle.partialObjectStream)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('rejects with install guidance when no provider is registered', async () => {
    const handle = ExpoAI.streamObject({ prompt: 'a person', schema: personSchema });
    await expect(handle.object).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'none',
      message: expect.stringContaining('Install and import a provider package'),
    });
  });

  it('rejects when the stream produces nothing usable and repair cannot satisfy the schema', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: 'definitely not json',
        supportsStreaming: true,
      }),
    );

    const handle = ExpoAI.streamObject({
      prompt: 'a person',
      schema: personSchema,
      provider: 'cloud',
      maxRepairAttempts: 0,
    });

    await expect(handle.object).rejects.toMatchObject({ provider: 'cloud' });
  });

  it('works when the provider does not stream (single-shot emulation)', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: '{"name":"Ada","age":36}',
        supportsStreaming: false,
      }),
    );

    const handle = ExpoAI.streamObject<{ name: string; age: number }>({
      prompt: 'a person',
      schema: personSchema,
      provider: 'cloud',
    });

    const partials = await collect(handle.partialObjectStream);
    const object = await handle.object;
    expect(object).toEqual({ name: 'Ada', age: 36 });
    expect(partials[partials.length - 1]).toEqual(object);
  });
});
