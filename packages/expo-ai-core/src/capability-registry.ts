/**
 * Capability registry (docs/prd.md §7).
 *
 * Aggregates availability/capabilities across registered adapters so apps can
 * gate features at runtime before showing them.
 */

import { getAdapter, getAdapters, getRegisteredProviders } from "./registry.js";
import {
  defaultProviderPriority,
  type ExpoAIAvailability,
  type ExpoAICapabilities,
  type ExpoAIProvider,
  type ExpoAIProviderInfo,
  type ExpoAIUnavailableReason,
} from "./types.js";

/** Registered providers, default-priority first, then any extras. */
function orderedRegisteredProviders(): ExpoAIProvider[] {
  const registered = new Set(getRegisteredProviders());
  const ordered: ExpoAIProvider[] = [];
  for (const provider of defaultProviderPriority) {
    if (registered.has(provider)) {
      ordered.push(provider);
      registered.delete(provider);
    }
  }
  // Any registered provider not in the default priority (e.g. a custom one).
  for (const provider of registered) ordered.push(provider);
  return ordered;
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
  const providers = orderedRegisteredProviders();
  if (providers.length === 0) {
    return { available: false, provider: "none", reasonUnavailable: "provider_not_configured" };
  }

  let firstReason: ExpoAIAvailability | undefined;
  for (const provider of providers) {
    const adapter = getAdapter(provider);
    if (!adapter) continue;
    const availability = await adapter.getAvailability();
    if (availability.available) return availability;
    firstReason ??= availability;
  }
  return firstReason ?? { available: false, provider: "none", reasonUnavailable: "unknown" };
}

/** Capabilities of the best currently-available provider. */
export async function getCapabilities(): Promise<ExpoAICapabilities> {
  const providers = orderedRegisteredProviders();
  if (providers.length === 0) {
    return unavailableCapabilities("none", "provider_not_configured");
  }

  let firstUnavailable: ExpoAICapabilities | undefined;
  for (const provider of providers) {
    const adapter = getAdapter(provider);
    if (!adapter) continue;
    const capabilities = await adapter.getCapabilities();
    if (capabilities.available) return capabilities;
    firstUnavailable ??= capabilities;
  }
  return firstUnavailable ?? unavailableCapabilities("none", "unknown");
}

/** Every registered provider and its current capabilities. */
export async function listProviders(): Promise<ExpoAIProviderInfo[]> {
  return Promise.all(
    getAdapters().map(async (adapter) => ({
      provider: adapter.provider,
      capabilities: await adapter.getCapabilities(),
    })),
  );
}
