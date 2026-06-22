import { beforeEach, describe, expect, it } from 'vitest';

import {
  ExpoAI,
  clearAdapters,
  getAvailability,
  getCapabilities,
  listProviders,
  registerAdapter,
} from '../index.js';
import { createMockAdapter } from '../testing.js';

beforeEach(() => clearAdapters());

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
});
