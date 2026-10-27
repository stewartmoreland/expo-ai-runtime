/**
 * Capability registry (docs/prd.md §7).
 *
 * Aggregates availability/capabilities across registered adapters so apps can
 * gate features at runtime before showing them.
 */

import { isProviderAllowed } from './privacy.js';
import { getAdapter, getAdapters, getOrderedProviders } from './registry.js';
import type {
  ExpoAIAvailability,
  ExpoAICapabilities,
  ExpoAIProvider,
  ExpoAIProviderInfo,
  ExpoAISubscription,
  ExpoAIUnavailableReason,
} from './types.js';

/** Registered providers the privacy policy permits, in routing order. */
function allowedProviders(): ExpoAIProvider[] {
  return getOrderedProviders().filter((provider) => isProviderAllowed(provider));
}

export function unavailableCapabilities(
  provider: ExpoAIProvider,
  reason: ExpoAIUnavailableReason,
): ExpoAICapabilities {
  return {
    available: false,
    provider,
    isOnDevice: false,
    isSystemManagedModel: false,
    sendsPromptOffDevice: false,
    supportsTextGeneration: false,
    supportsStreaming: false,
    supportsSessions: false,
    supportsStructuredOutput: false,
    supportsTools: false,
    supportsImageInput: false,
    supportsSpeechInput: false,
    supportsSummarization: false,
    supportsRewrite: false,
    supportsProofreading: false,
    supportsBringYourOwnModel: false,
    supportsModelDownload: false,
    reasonUnavailable: reason,
  };
}

/** Availability of the best (highest-priority) currently-available provider. */
export async function getAvailability(): Promise<ExpoAIAvailability> {
  const providers = allowedProviders();
  if (providers.length === 0) {
    return { available: false, provider: 'none', reasonUnavailable: 'provider_not_configured' };
  }

  let firstReason: ExpoAIAvailability | undefined;
  for (const provider of providers) {
    const adapter = getAdapter(provider);
    if (!adapter) continue;
    const availability = await adapter.getAvailability();
    if (availability.available) return availability;
    firstReason ??= availability;
  }
  return firstReason ?? { available: false, provider: 'none', reasonUnavailable: 'unknown' };
}

/** Capabilities of the best currently-available provider. */
export async function getCapabilities(): Promise<ExpoAICapabilities> {
  const providers = allowedProviders();
  if (providers.length === 0) {
    return unavailableCapabilities('none', 'provider_not_configured');
  }

  let firstUnavailable: ExpoAICapabilities | undefined;
  for (const provider of providers) {
    const adapter = getAdapter(provider);
    if (!adapter) continue;
    const capabilities = await adapter.getCapabilities();
    if (capabilities.available) return capabilities;
    firstUnavailable ??= capabilities;
  }
  return firstUnavailable ?? unavailableCapabilities('none', 'unknown');
}

const availabilityListeners = new Set<(availability: ExpoAIAvailability) => void>();

/** Subscribe to provider availability changes (see {@link notifyAvailabilityChange}). */
export function onAvailabilityChange(
  callback: (availability: ExpoAIAvailability) => void,
): ExpoAISubscription {
  availabilityListeners.add(callback);
  return { remove: () => void availabilityListeners.delete(callback) };
}

/**
 * Re-probe `provider` and fan its availability out to subscribers. Provider
 * packages call this on app foreground or after a model download. No-op when
 * nothing is subscribed; listener and probe errors are swallowed.
 */
export function notifyAvailabilityChange(provider: ExpoAIProvider): void {
  const adapter = getAdapter(provider);
  if (!adapter || availabilityListeners.size === 0) return;
  adapter.getAvailability().then(
    (availability) => {
      for (const listener of availabilityListeners) {
        try {
          listener(availability);
        } catch {
          // A broken listener must not stop the others.
        }
      }
    },
    () => undefined,
  );
}

/** Every registered provider and its current capabilities (not policy-filtered). */
export async function listProviders(): Promise<ExpoAIProviderInfo[]> {
  return Promise.all(
    getAdapters().map(async (adapter) => ({
      provider: adapter.provider,
      capabilities: await adapter.getCapabilities(),
    })),
  );
}
