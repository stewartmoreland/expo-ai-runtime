import { beforeEach, describe, expect, it } from 'vitest';

import { ExpoAI, clearAdapters, registerAdapter, type GenerateChunk } from '../index.js';
import { createMockAdapter } from '../testing.js';

beforeEach(() => clearAdapters());

async function collect(iterable: AsyncIterable<GenerateChunk>): Promise<GenerateChunk[]> {
  const chunks: GenerateChunk[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe('streaming', () => {
  it('yields start, deltas, then done with the full result', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: 'hello world',
        supportsStreaming: true,
      }),
    );

    const chunks = await collect(ExpoAI.stream({ prompt: 'hi' }));

    expect(chunks[0]).toMatchObject({ type: 'start', provider: 'apple-foundation-models' });

    const deltas = chunks.flatMap((c) => (c.type === 'delta' ? [c.text] : [])).join('');
    expect(deltas).toBe('hello world');

    const done = chunks.find((c) => c.type === 'done');
    expect(done).toBeDefined();
    if (done && done.type === 'done') {
      expect(done.result.text).toBe('hello world');
      expect(done.result.provider).toBe('apple-foundation-models');
      expect(done.result.privacy.privacyMode).toBe('on-device');
    }
  });

  it('emulates streaming for adapters without a native stream', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', respondWith: 'abc', supportsStreaming: false }),
    );
    const chunks = await collect(ExpoAI.stream({ prompt: 'hi', provider: 'cloud' }));
    expect(chunks.map((c) => c.type)).toEqual(['start', 'delta', 'done']);
  });

  it('throws an ExpoAIError mid-stream on adapter error', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        throwError: { code: 'RATE_LIMITED' },
        supportsStreaming: true,
      }),
    );
    await expect(collect(ExpoAI.stream({ prompt: 'hi', provider: 'cloud' }))).rejects.toMatchObject(
      {
        code: 'RATE_LIMITED',
      },
    );
  });

  it('cancels via AbortSignal', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: 'a b c d e f g h',
        supportsStreaming: true,
        delayMs: 5,
      }),
    );

    const controller = new AbortController();
    const iterable = ExpoAI.stream({ prompt: 'hi', provider: 'cloud', signal: controller.signal });

    await expect(
      (async () => {
        for await (const chunk of iterable) {
          // Abort as soon as streaming starts.
          if (chunk.type === 'start') controller.abort();
        }
      })(),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('honors mid-flight abort on the emulated (non-native streaming) path', async () => {
    const adapter = {
      provider: 'cloud',
      async getAvailability() {
        return { available: true, provider: 'cloud' };
      },
      async getCapabilities() {
        return { available: true, provider: 'cloud' };
      },
      async generate() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { text: 'late' };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const controller = new AbortController();
    const iterable = ExpoAI.stream({ prompt: 'hi', provider: 'cloud', signal: controller.signal });
    setTimeout(() => controller.abort(), 10);

    await expect(
      (async () => {
        for await (const chunk of iterable) void chunk;
      })(),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('emits a single start even when the adapter sends a delta before onStart', async () => {
    const adapter = {
      provider: 'cloud',
      async getAvailability() {
        return { available: true, provider: 'cloud' };
      },
      async getCapabilities() {
        return { available: true, provider: 'cloud' };
      },
      async generate() {
        return { text: 'hi' };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream(_req: any, handlers: any) {
        handlers.onDelta('hi');
        handlers.onStart?.();
        handlers.onDone({ text: 'hi' });
        return { cancel() {} };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const chunks = await collect(ExpoAI.stream({ prompt: 'hi', provider: 'cloud' }));
    expect(chunks.filter((c) => c.type === 'start')).toHaveLength(1);
    expect(chunks.map((c) => c.type)).toEqual(['start', 'delta', 'done']);
  });
});
