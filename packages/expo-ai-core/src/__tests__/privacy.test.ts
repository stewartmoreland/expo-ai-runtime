import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ExpoAI,
  PRIVACY_COPY,
  buildCandidateList,
  clearAdapters,
  getCapabilities,
  isProviderAllowed,
  privacyInfoForProvider,
  privacyModeForProvider,
  providerSendsPromptOffDevice,
  registerAdapter,
  type ExpoAIProvider,
} from '../index.js';
import { createMockAdapter, resetPrivacyPolicy } from '../testing.js';

beforeEach(() => clearAdapters());
afterEach(() => resetPrivacyPolicy());

describe('privacy policy', () => {
  it('allows every real provider by default', () => {
    for (const p of [
      'apple-foundation-models',
      'apple-private-cloud-compute',
      'android-aicore-gemini-nano',
      'litert-lm',
      'cloud',
    ] as const) {
      expect(isProviderAllowed(p)).toBe(true);
    }
  });

  it('excludes an explicit provider outside the policy', async () => {
    registerAdapter(createMockAdapter({ provider: 'cloud' }));
    ExpoAI.setPrivacyPolicy({ allowedModes: ['on-device'], allowedProviders: ['cloud'] });

    expect(buildCandidateList({ provider: 'cloud' })).toEqual([]);
    await expect(ExpoAI.generate({ prompt: 'hi', provider: 'cloud' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('sensitiveByDefault cannot be overridden by sensitive: false', () => {
    registerAdapter(createMockAdapter({ provider: 'cloud' }));
    ExpoAI.setPrivacyPolicy({
      ...ExpoAI.getPrivacyPolicy(),
      sensitiveByDefault: true,
    });
    expect(buildCandidateList({ fallback: 'any', sensitive: false })).toEqual([]);
    expect(buildCandidateList({ fallback: 'cloud', sensitive: false })).toEqual(['cloud']);
  });

  it('a locked policy throws on the next set', () => {
    ExpoAI.setPrivacyPolicy({ allowedModes: ['on-device'], allowedProviders: [], lock: true });
    expect(() =>
      ExpoAI.setPrivacyPolicy({ allowedModes: ['on-device'], allowedProviders: [] }),
    ).toThrow('locked');
  });

  it("mutating the caller's arrays after set has no effect", () => {
    const allowedProviders: ExpoAIProvider[] = ['apple-foundation-models'];
    ExpoAI.setPrivacyPolicy({ allowedModes: ['on-device'], allowedProviders });
    allowedProviders.push('cloud');
    expect(isProviderAllowed('cloud')).toBe(false);
    expect(ExpoAI.getPrivacyPolicy().allowedProviders).toEqual(['apple-foundation-models']);
  });

  it('getCapabilities respects the policy', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models' }));
    registerAdapter(createMockAdapter({ provider: 'android-aicore-gemini-nano' }));
    ExpoAI.setPrivacyPolicy({
      allowedModes: ['on-device'],
      allowedProviders: ['android-aicore-gemini-nano'],
    });
    expect((await getCapabilities()).provider).toBe('android-aicore-gemini-nano');
  });
});

describe('privacy', () => {
  it('maps providers to privacy modes', () => {
    expect(privacyModeForProvider('apple-foundation-models')).toBe('on-device');
    expect(privacyModeForProvider('android-aicore-gemini-nano')).toBe('on-device');
    expect(privacyModeForProvider('litert-lm')).toBe('on-device');
    expect(privacyModeForProvider('apple-private-cloud-compute')).toBe(
      'apple-private-cloud-compute',
    );
    expect(privacyModeForProvider('cloud')).toBe('third-party-cloud');
    expect(privacyModeForProvider('none')).toBe('unknown');
  });

  it('derives on-device / off-device flags', () => {
    expect(privacyInfoForProvider('apple-foundation-models')).toMatchObject({
      isOnDevice: true,
      sendsPromptOffDevice: false,
    });
    expect(privacyInfoForProvider('cloud')).toMatchObject({
      isOnDevice: false,
      sendsPromptOffDevice: true,
    });
    expect(privacyInfoForProvider('apple-private-cloud-compute')).toMatchObject({
      isOnDevice: false,
      sendsPromptOffDevice: true,
    });
    expect(providerSendsPromptOffDevice('cloud')).toBe(true);
    expect(providerSendsPromptOffDevice('apple-foundation-models')).toBe(false);
  });

  it('provides human-facing UI copy for each mode', () => {
    expect(PRIVACY_COPY['on-device']).toMatch(/on this device/i);
    expect(PRIVACY_COPY['apple-private-cloud-compute']).toMatch(/private cloud compute/i);
    expect(PRIVACY_COPY['third-party-cloud']).toMatch(/cloud/i);
  });
});
