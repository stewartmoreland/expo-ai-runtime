import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ExpoAI,
  buildCandidateList,
  clearAdapters,
  defaultProviderPriority,
  registerAdapter,
} from '../index.js';
import { createMockAdapter, resetPrivacyPolicy } from '../testing.js';

beforeEach(() => clearAdapters());
afterEach(() => resetPrivacyPolicy());

describe('provider router — selection & priority', () => {
  it('pins the default priority: on-device first, PCC last, no cloud', () => {
    expect(defaultProviderPriority).toEqual([
      'apple-foundation-models',
      'android-aicore-gemini-nano',
      'litert-lm',
      'apple-private-cloud-compute',
    ]);
  });

  it('appends non-priority providers (cloud) after the priority ones', () => {
    registerAdapter(createMockAdapter({ provider: 'cloud' }));
    registerAdapter(createMockAdapter({ provider: 'apple-private-cloud-compute' }));
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    expect(buildCandidateList({ fallback: 'any' })).toEqual([
      'apple-foundation-models',
      'apple-private-cloud-compute',
      'cloud',
    ]);
  });

  it('uses the highest-priority available provider', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: 'apple' }),
    );
    registerAdapter(
      createMockAdapter({ provider: 'android-aicore-gemini-nano', respondWith: 'android' }),
    );

    const result = await ExpoAI.generate({ prompt: 'hi' });

    expect(result.provider).toBe('apple-foundation-models');
    expect(result.text).toBe('apple');
    expect(result.usedFallback).toBe(false);
    expect(result.privacy.privacyMode).toBe('on-device');
    expect(result.privacy.sendsPromptOffDevice).toBe(false);
  });

  it('honors an explicitly requested provider', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: 'apple' }),
    );
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'cloud' }));

    const result = await ExpoAI.generate({ prompt: 'hi', provider: 'cloud' });
    expect(result.provider).toBe('cloud');
    expect(result.text).toBe('cloud');
  });

  it('rejects an empty prompt with INVALID_PROMPT', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    await expect(ExpoAI.generate({ prompt: '   ' })).rejects.toMatchObject({
      code: 'INVALID_PROMPT',
    });
  });

  it('throws UNAVAILABLE(none) when no providers are registered', async () => {
    await expect(ExpoAI.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'none',
    });
  });
});

describe('provider router — zero-config first-run messaging', () => {
  it('guides the developer to install a provider package when none is registered', async () => {
    await expect(ExpoAI.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'none',
      message: expect.stringContaining('Install and import a provider package'),
    });
  });

  it('the install guidance names the provider packages and self-registration', async () => {
    const error = (await ExpoAI.generate({ prompt: 'hi' }).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain('@stewmore/expo-ai-apple-foundation-models');
    expect(error.message).toContain('@stewmore/expo-ai-android-aicore');
    expect(error.message).toContain('self-register on import');
  });

  it('points at fallback when only an off-device provider is registered', async () => {
    // Only a cloud provider is registered, but the default fallback is 'none',
    // so the cloud candidate is gated out and the list is empty.
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'cloud' }));

    const error = (await ExpoAI.generate({ prompt: 'hi' }).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: 'UNAVAILABLE', provider: 'none' });
    expect(error.message).toContain('fallback');
    expect(error.message).toContain('cloud');
    // It must NOT show the install guidance — a provider *is* registered.
    expect(error.message).not.toContain('Install and import a provider package');
  });

  it('points at the privacy policy when it excludes every registered provider', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    ExpoAI.setPrivacyPolicy({ allowedModes: ['on-device'], allowedProviders: [] });

    const error = (await ExpoAI.generate({ prompt: 'hi' }).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: 'UNAVAILABLE', provider: 'none' });
    expect(error.message).toContain('privacy policy');
  });

  it('streaming surfaces the same install guidance when no provider is registered', async () => {
    const iterator = ExpoAI.stream({ prompt: 'hi' })[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'none',
      message: expect.stringContaining('Install and import a provider package'),
    });
  });

  it('generateObject surfaces the same install guidance when no provider is registered', async () => {
    await expect(
      ExpoAI.generateObject({ prompt: 'hi', schema: { type: 'object' } }),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'none',
      message: expect.stringContaining('Install and import a provider package'),
    });
  });

  it('keeps the provider-specific reason when a registered provider is unavailable', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'apple_intelligence_disabled',
      }),
    );

    const error = (await ExpoAI.generate({ prompt: 'hi' }).catch((e: unknown) => e)) as Error;
    expect(error).toMatchObject({ code: 'UNAVAILABLE', provider: 'apple-foundation-models' });
    expect(error.message).toContain('apple_intelligence_disabled');
  });

  it('maps specific unavailable reasons to their error codes', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'unsupported_locale',
      }),
    );
    await expect(ExpoAI.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_LOCALE',
    });
  });

  it('skips a quota-exhausted provider under fallback, fails with QUOTA_EXHAUSTED without it', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-private-cloud-compute',
        available: false,
        reasonUnavailable: 'quota_exhausted',
      }),
    );
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'cloud!' }));
    const provider = 'apple-private-cloud-compute';

    await expect(ExpoAI.generate({ prompt: 'hi', provider })).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
    });
    const result = await ExpoAI.generate({ prompt: 'hi', provider, fallback: 'any' });
    expect(result.provider).toBe('cloud');
    expect(result.usedFallback).toBe(true);
  });
});

describe('provider router — fallback', () => {
  it('falls back to cloud when the system provider is unavailable and fallback is cloud', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'apple_intelligence_disabled',
      }),
    );
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'cloud!' }));

    const result = await ExpoAI.generate({ prompt: 'hi', fallback: 'cloud' });

    expect(result.provider).toBe('cloud');
    expect(result.usedFallback).toBe(true);
    expect(result.privacy.privacyMode).toBe('third-party-cloud');
    expect(result.privacy.sendsPromptOffDevice).toBe(true);
  });

  it('does not use cloud when fallback is none', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', available: false }));
    registerAdapter(createMockAdapter({ provider: 'cloud' }));

    await expect(ExpoAI.generate({ prompt: 'hi', fallback: 'none' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('retries the next candidate on a fallback-recommended error', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        throwError: { code: 'MODEL_NOT_READY' },
      }),
    );
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'rescued' }));

    const result = await ExpoAI.generate({ prompt: 'hi', fallback: 'cloud' });

    expect(result.provider).toBe('cloud');
    expect(result.text).toBe('rescued');
    expect(result.usedFallback).toBe(true);
  });

  it('does NOT fall back on a non-fallback error (safety)', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        throwError: { code: 'SAFETY_BLOCKED' },
      }),
    );
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'should-not-be-used' }));

    await expect(ExpoAI.generate({ prompt: 'hi', fallback: 'cloud' })).rejects.toMatchObject({
      code: 'SAFETY_BLOCKED',
    });
  });
});

describe('provider router — privacy / sensitivity gating', () => {
  it("blocks a sensitive prompt from third-party cloud even when fallback is 'any'", async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', available: false }));
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'leak' }));

    await expect(
      ExpoAI.generate({ prompt: 'secret', sensitive: true, fallback: 'any' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  it("allows a sensitive prompt to cloud only when fallback is explicitly 'cloud'", async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', available: false }));
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'ok' }));

    const result = await ExpoAI.generate({ prompt: 'secret', sensitive: true, fallback: 'cloud' });
    expect(result.provider).toBe('cloud');
  });

  it("allows a non-sensitive prompt to cloud with fallback 'any'", async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', available: false }));
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'ok' }));

    const result = await ExpoAI.generate({ prompt: 'weather?', fallback: 'any' });
    expect(result.provider).toBe('cloud');
  });

  it("does not route to Private Cloud Compute with fallback 'none'", async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', available: false }));
    registerAdapter(createMockAdapter({ provider: 'apple-private-cloud-compute' }));

    await expect(ExpoAI.generate({ prompt: 'hi' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      provider: 'apple-foundation-models',
    });
  });

  it("allows a sensitive prompt to Private Cloud Compute with fallback 'any', but not cloud", async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-private-cloud-compute' }));
    registerAdapter(createMockAdapter({ provider: 'cloud' }));

    expect(buildCandidateList({ sensitive: true, fallback: 'any' })).toEqual([
      'apple-private-cloud-compute',
    ]);
    const result = await ExpoAI.generate({ prompt: 'secret', sensitive: true, fallback: 'any' });
    expect(result.provider).toBe('apple-private-cloud-compute');
    expect(result.privacy.sendsPromptOffDevice).toBe(true);
  });

  it('routes to Private Cloud Compute when explicitly requested, even with fallback none', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-private-cloud-compute' }));
    const result = await ExpoAI.generate({ prompt: 'hi', provider: 'apple-private-cloud-compute' });
    expect(result.provider).toBe('apple-private-cloud-compute');
    expect(result.usedFallback).toBe(false);
  });
});

describe('provider router — usedFallback accuracy & task routing', () => {
  it('reports usedFallback when the explicitly-requested provider is not registered', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'android-aicore-gemini-nano', respondWith: 'android' }),
    );

    const result = await ExpoAI.generate({
      prompt: 'hi',
      provider: 'apple-foundation-models',
      fallback: 'any',
    });
    expect(result.provider).toBe('android-aicore-gemini-nano');
    expect(result.usedFallback).toBe(true);
  });

  it('reports usedFallback=false when the requested provider serves the request', async () => {
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'c' }));
    const result = await ExpoAI.generate({ prompt: 'hi', provider: 'cloud' });
    expect(result.usedFallback).toBe(false);
  });

  it('forwards the summarize length hint to a native summarize handler', async () => {
    let received: { text?: string; length?: string } = {};
    const adapter = {
      provider: 'apple-foundation-models',
      async getAvailability() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      async getCapabilities() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      async generate() {
        return { text: 'generated' };
      },
      async summarize(req: { text?: string; length?: string }) {
        received = req;
        return { text: 'summary' };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    await ExpoAI.summarize({ text: 'a long note to compress', length: 'short' });
    expect(received.text).toBe('a long note to compress');
    expect(received.length).toBe('short');
  });
});

describe('provider router — abort signal', () => {
  it('rejects generate when the signal is already aborted, without starting generation', async () => {
    const prompts: string[] = [];
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: (prompt) => {
          prompts.push(prompt);
          return 'x';
        },
      }),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      ExpoAI.generate({ prompt: 'hi', provider: 'cloud', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(prompts).toEqual([]);
  });

  it('rejects generate when aborted mid-flight', async () => {
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
    const promise = ExpoAI.generate({ prompt: 'hi', provider: 'cloud', signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
