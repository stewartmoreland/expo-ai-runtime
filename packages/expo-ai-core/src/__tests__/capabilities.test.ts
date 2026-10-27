import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ExpoAI,
  clearAdapters,
  getAvailability,
  getCapabilities,
  listProviders,
  notifyAvailabilityChange,
  registerAdapter,
  type ExpoAIAvailability,
} from '../index.js';
import { createMockAdapter, resetPrivacyPolicy } from '../testing.js';

beforeEach(() => clearAdapters());
afterEach(() => resetPrivacyPolicy());

describe('capability registry', () => {
  it('reports availability of the best available provider', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'apple_intelligence_disabled',
      }),
    );
    registerAdapter(createMockAdapter({ provider: 'android-aicore-gemini-nano', available: true }));

    const availability = await getAvailability();
    expect(availability.available).toBe(true);
    expect(availability.provider).toBe('android-aicore-gemini-nano');
  });

  it('returns the unavailable reason when nothing is available', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'unsupported_device',
      }),
    );
    const availability = await getAvailability();
    expect(availability.available).toBe(false);
    expect(availability.reasonUnavailable).toBe('unsupported_device');
  });

  it('reports provider_not_configured when no adapters are registered', async () => {
    expect(await getAvailability()).toMatchObject({
      available: false,
      provider: 'none',
      reasonUnavailable: 'provider_not_configured',
    });
    expect((await getCapabilities()).available).toBe(false);
  });

  it("getCapabilities returns the best available provider's capabilities", async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: true,
        capabilities: { contextWindow: 4096 },
      }),
    );
    const capabilities = await getCapabilities();
    expect(capabilities.available).toBe(true);
    expect(capabilities.provider).toBe('apple-foundation-models');
    expect(capabilities.contextWindow).toBe(4096);
  });

  it('listProviders returns every registered provider', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    registerAdapter(createMockAdapter({ provider: 'cloud' }));
    const list = await listProviders();
    expect(list.map((info) => info.provider).sort()).toEqual(['apple-foundation-models', 'cloud']);
  });

  it('ExpoAI namespace exposes the capability methods', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    expect((await ExpoAI.getAvailability()).available).toBe(true);
    expect((await ExpoAI.getCapabilities()).provider).toBe('apple-foundation-models');
  });

  it('notifyAvailabilityChange reaches subscribers until remove()', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        available: false,
        reasonUnavailable: 'model_not_downloaded',
      }),
    );
    const seen: ExpoAIAvailability[] = [];
    const subscription = ExpoAI.onAvailabilityChange((a) => seen.push(a));

    notifyAvailabilityChange('apple-foundation-models');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([
      {
        available: false,
        provider: 'apple-foundation-models',
        reasonUnavailable: 'model_not_downloaded',
      },
    ]);

    subscription.remove();
    notifyAvailabilityChange('apple-foundation-models');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toHaveLength(1);
  });

  it('ExpoAI.prewarm resolves the adapter result, or false when unsupported', async () => {
    expect(await ExpoAI.prewarm()).toBe(false); // nothing registered: never throws
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    expect(await ExpoAI.prewarm()).toBe(false);
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', prewarm: true }));
    expect(await ExpoAI.prewarm({ instructions: 'be brief' })).toBe(true);
  });
});
