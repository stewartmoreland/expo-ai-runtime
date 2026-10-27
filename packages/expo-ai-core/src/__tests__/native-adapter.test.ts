import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { AdapterStreamHandlers, NormalizedGenerateRequest } from '../adapter.js';
import { ExpoAIError } from '../errors.js';
import {
  createNativeAdapter,
  createUnavailableNativeAdapter,
  type NativeAvailability,
  type NativeCapabilityProfile,
  type NativeGenerateResult,
  type NativeStreamEvent,
  type NativeStreamingModule,
} from '../native-adapter.js';

const PROFILE: NativeCapabilityProfile = {
  isOnDevice: true,
  isSystemManagedModel: true,
  sendsPromptOffDevice: false,
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsSessions: true,
  supportsStructuredOutput: true,
  supportsTools: false,
  supportsImageInput: false,
  supportsSpeechInput: false,
  supportsSummarization: true,
  supportsRewrite: true,
  supportsProofreading: true,
  supportsBringYourOwnModel: false,
  supportsModelDownload: false,
  contextWindow: 4096,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = Mock<(...args: any[]) => Promise<NativeGenerateResult>>;

class MockNative implements NativeStreamingModule {
  available = true;
  reasonUnavailable: string | undefined;
  throwOnAvailability = false;
  sessionDisposeThrows = false;
  extraAvailability: Partial<NativeAvailability> = {};
  private listeners: Array<(event: NativeStreamEvent) => void> = [];
  startStreaming = vi.fn(async (_requestId: string, _options: Record<string, unknown>) => {});
  cancelStreaming = vi.fn(async () => {});
  cancel = vi.fn(async (_requestId: string) => {});
  prewarm?: NativeStreamingModule['prewarm'];
  generate: NativeFn = vi.fn(async () => ({ text: 'gen', finishReason: 'stop' }));
  generateInSession: NativeFn = vi.fn(async () => ({ text: 'sgen' }));
  generateObject: NativeFn = vi.fn(async () => ({ text: '{}' }));

  async getAvailability() {
    if (this.throwOnAvailability) throw new Error('probe failed');
    const availability: { available: boolean; provider: string; reasonUnavailable?: string } = {
      available: this.available,
      provider: 'x',
    };
    if (this.reasonUnavailable) availability.reasonUnavailable = this.reasonUnavailable;
    return { ...availability, ...this.extraAvailability };
  }
  async createSession() {
    return { sessionId: 's1' };
  }
  async resetSession() {}
  async disposeSession() {
    if (this.sessionDisposeThrows) throw new Error('session gone');
  }
  addListener(_event: 'onExpoAIStream', listener: (event: NativeStreamEvent) => void) {
    this.listeners.push(listener);
    return {
      remove: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }
  emit(event: NativeStreamEvent) {
    for (const listener of [...this.listeners]) listener(event);
  }
  get listenerCount() {
    return this.listeners.length;
  }
}

function collectHandlers() {
  const events: Array<[string, unknown]> = [];
  const handlers: AdapterStreamHandlers = {
    onStart: () => events.push(['start', undefined]),
    onDelta: (text) => events.push(['delta', text]),
    onDone: (result) => events.push(['done', result]),
    onError: (error) => events.push(['error', error]),
  };
  return { handlers, events };
}

const PROVIDER = 'apple-foundation-models' as const;

describe('createNativeAdapter — capabilities', () => {
  it('zeroes capabilities when the device is unavailable', async () => {
    const native = new MockNative();
    native.available = false;
    native.reasonUnavailable = 'model_initializing';
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });

    const caps = await adapter.getCapabilities();
    expect(caps.available).toBe(false);
    expect(caps.isOnDevice).toBe(false);
    expect(caps.supportsStreaming).toBe(false);
    expect(caps.supportsSummarization).toBe(false);
    expect(caps.reasonUnavailable).toBe('model_initializing');
  });

  it('returns the capability profile when available', async () => {
    const native = new MockNative();
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const caps = await adapter.getCapabilities();
    expect(caps.available).toBe(true);
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.contextWindow).toBe(4096);
  });

  it('reports unavailable (does not throw) when the native probe rejects', async () => {
    const native = new MockNative();
    native.throwOnAvailability = true;
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const availability = await adapter.getAvailability();
    expect(availability.available).toBe(false);
    expect(availability.reasonUnavailable).toBe('unknown');
  });
});

describe('createNativeAdapter — streaming bridge', () => {
  let native: MockNative;
  let adapter: ReturnType<typeof createNativeAdapter>;

  beforeEach(() => {
    native = new MockNative();
    adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
  });

  function startStream() {
    const { handlers, events } = collectHandlers();
    adapter.stream!({ prompt: 'hi' }, handlers);
    const requestId = native.startStreaming.mock.lastCall![0] as string;
    return { events, requestId };
  }

  it('bridges start/token/done and uses accumulated text when done has no result', () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: 'start' });
    native.emit({ requestId, type: 'token', text: 'Hello ' });
    native.emit({ requestId, type: 'token', text: '' }); // suppressed
    native.emit({ requestId, type: 'token', text: 'world' });
    native.emit({ requestId, type: 'done' }); // no result

    expect(events.filter((e) => e[0] === 'delta').map((e) => e[1])).toEqual(['Hello ', 'world']);
    expect((events.find((e) => e[0] === 'done')![1] as { text: string }).text).toBe('Hello world');
    expect(native.listenerCount).toBe(0);
  });

  it('ignores an unknown event type without hanging, then completes on done', () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: 'weird' as never });
    native.emit({ requestId, type: 'done', result: { text: 'ok' } });
    expect((events.find((e) => e[0] === 'done')![1] as { text: string }).text).toBe('ok');
  });

  it('normalizes an error event to ExpoAIError and removes the subscription', () => {
    const { events, requestId } = startStream();
    native.emit({ requestId, type: 'error', error: { code: 'RATE_LIMITED', message: 'x' } });
    expect((events.find((e) => e[0] === 'error')![1] as { code: string }).code).toBe(
      'RATE_LIMITED',
    );
    expect(native.listenerCount).toBe(0);
  });

  it('stops emitting and removes the subscription after cancel', () => {
    const { handlers, events } = collectHandlers();
    const handle = adapter.stream!({ prompt: 'hi' }, handlers);
    const requestId = native.startStreaming.mock.lastCall![0] as string;
    native.emit({ requestId, type: 'start' });
    handle.cancel();
    native.emit({ requestId, type: 'token', text: 'late' });
    expect(events.filter((e) => e[0] === 'delta')).toHaveLength(0);
    expect(native.cancelStreaming).toHaveBeenCalledWith(requestId);
    expect(native.listenerCount).toBe(0);
  });

  it('ignores events for a different requestId', () => {
    const { events, requestId } = startStream();
    native.emit({ requestId: 'other', type: 'token', text: 'nope' });
    native.emit({ requestId, type: 'token', text: 'yes' });
    expect(events.filter((e) => e[0] === 'delta').map((e) => e[1])).toEqual(['yes']);
  });
});

describe('createNativeAdapter — sessions & unavailable', () => {
  it('normalizes native session lifecycle errors to ExpoAIError', async () => {
    const native = new MockNative();
    native.sessionDisposeThrows = true;
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    const session = await adapter.createSession!({});
    await expect(session.dispose()).rejects.toMatchObject({ code: 'NATIVE_PROVIDER_ERROR' });
  });

  it('createUnavailableNativeAdapter reports unavailable and throws UNAVAILABLE', async () => {
    const adapter = createUnavailableNativeAdapter(PROVIDER, 'unsupported_device');
    expect((await adapter.getAvailability()).available).toBe(false);
    expect((await adapter.getCapabilities()).supportsStreaming).toBe(false);
    await expect(adapter.generate({ prompt: 'hi' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('createNativeAdapter — request bridge', () => {
  const PATHS = ['generate', 'session', 'object'] as const;
  type Path = (typeof PATHS)[number];

  const nativeFn = (native: MockNative, path: Path): NativeFn =>
    path === 'generate'
      ? native.generate
      : path === 'object'
        ? native.generateObject
        : native.generateInSession;

  /** The options dictionary (always the last argument) of the latest native call. */
  function lastOptions(native: MockNative, path: Path): Record<string, unknown> {
    const args = nativeFn(native, path).mock.lastCall!;
    return args[args.length - 1] as Record<string, unknown>;
  }

  async function call(native: MockNative, path: Path, req: NormalizedGenerateRequest) {
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    if (path === 'generate') return adapter.generate(req);
    if (path === 'object') {
      return adapter.generateObject!({ ...req, schema: { type: 'object' }, schemaName: 'S' });
    }
    return (await adapter.createSession!({})).generate(req);
  }

  it.each(PATHS)('%s: abort calls cancel(requestId) with the id sent to native', async (path) => {
    const native = new MockNative();
    let resolve!: (result: NativeGenerateResult) => void;
    nativeFn(native, path).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const controller = new AbortController();
    const pending = call(native, path, {
      prompt: 'hi',
      reasoningLevel: 'deep',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(nativeFn(native, path)).toHaveBeenCalled());

    const options = lastOptions(native, path);
    expect(options).toMatchObject({ prompt: 'hi', reasoningLevel: 'deep' });
    expect(typeof options.requestId).toBe('string');
    controller.abort();
    expect(native.cancel).toHaveBeenCalledWith(options.requestId);
    resolve({ text: 'late' });
    await pending;
  });

  it.each(PATHS)('%s: an already-aborted signal skips the native call', async (path) => {
    const native = new MockNative();
    await expect(
      call(native, path, { prompt: 'hi', signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(nativeFn(native, path)).not.toHaveBeenCalled();
  });

  it.each(PATHS)('%s: an error-as-value result throws a typed ExpoAIError', async (path) => {
    const native = new MockNative();
    nativeFn(native, path).mockResolvedValueOnce({
      text: '',
      error: { code: 'REFUSAL', message: 'no', detail: 'policy' },
    });
    const error = await call(native, path, { prompt: 'hi' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpoAIError);
    expect(error).toMatchObject({
      code: 'REFUSAL',
      provider: PROVIDER,
      detail: 'policy',
      fallbackRecommended: false,
    });
  });

  it('generateObject sends the schema as JSON and is omitted without native support', async () => {
    const native = new MockNative();
    await call(native, 'object', { prompt: 'hi' });
    expect(lastOptions(native, 'object')).toMatchObject({
      schemaJson: '{"type":"object"}',
      schemaName: 'S',
    });

    const bare = new MockNative() as Partial<MockNative>;
    delete bare.generateObject;
    const adapter = createNativeAdapter(bare as NativeStreamingModule, {
      provider: PROVIDER,
      capabilityProfile: PROFILE,
    });
    expect(adapter.generateObject).toBeUndefined();
  });

  it('copies usage counts and keeps only a known source', async () => {
    const native = new MockNative();
    const counts = {
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      cachedInputTokens: 1,
      reasoningTokens: 2,
    };
    native.generate.mockResolvedValueOnce({ text: 'x', usage: { ...counts, source: 'bogus' } });
    native.generate.mockResolvedValueOnce({ text: 'x', usage: { ...counts, source: 'estimated' } });
    expect((await call(native, 'generate', { prompt: 'hi' }))!.usage).toEqual(counts);
    expect((await call(native, 'generate', { prompt: 'hi' }))!.usage).toEqual({
      ...counts,
      source: 'estimated',
    });
  });

  it('stream done carries usage, and a done error-as-value becomes onError', () => {
    const native = new MockNative();
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });

    const ok = collectHandlers();
    adapter.stream!({ prompt: 'hi' }, ok.handlers);
    let requestId = native.startStreaming.mock.lastCall![0] as string;
    native.emit({ requestId, type: 'done', result: { text: 'ok', usage: { outputTokens: 2 } } });
    expect(ok.events.find((e) => e[0] === 'done')![1]).toMatchObject({
      usage: { outputTokens: 2 },
    });

    const bad = collectHandlers();
    adapter.stream!({ prompt: 'hi' }, bad.handlers);
    requestId = native.startStreaming.mock.lastCall![0] as string;
    native.emit({ requestId, type: 'done', result: { text: '', error: { code: 'REFUSAL' } } });
    expect(bad.events.find((e) => e[0] === 'error')![1]).toMatchObject({ code: 'REFUSAL' });
    expect(native.listenerCount).toBe(0);
  });
});

describe('createNativeAdapter — availability passthrough & prewarm', () => {
  it('passes contextWindow and supportedLanguages through', async () => {
    const native = new MockNative();
    native.extraAvailability = { contextWindow: 8192, supportedLanguages: ['en-US', 'fr-FR'] };
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    expect((await adapter.getCapabilities()).contextWindow).toBe(8192);
    expect((await adapter.getAvailability()).supportedLanguages).toEqual(['en-US', 'fr-FR']);
  });

  it('prewarm is absent / false when the native method is missing', async () => {
    const native = new MockNative();
    const adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    expect(adapter.prewarm).toBeUndefined();
    expect(await (await adapter.createSession!({})).prewarm!({ promptPrefix: 'p' })).toBe(false);
  });

  it('prewarm forwards options and resolves false when native rejects', async () => {
    const native = new MockNative();
    native.prewarm = vi.fn(async () => true);
    let adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    expect(await adapter.prewarm!({ instructions: 'i' })).toBe(true);
    expect(native.prewarm).toHaveBeenCalledWith({ instructions: 'i' });

    native.prewarm = vi.fn(async () => {
      throw new Error('boom');
    });
    adapter = createNativeAdapter(native, { provider: PROVIDER, capabilityProfile: PROFILE });
    expect(await adapter.prewarm!({})).toBe(false);
  });
});
