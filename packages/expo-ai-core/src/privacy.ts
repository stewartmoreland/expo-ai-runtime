/**
 * Privacy metadata (docs/prd.md §14).
 *
 * Every result the runtime hands back identifies where processing happened so
 * apps can show honest UI copy. Derived from the chosen provider.
 */

import type { ExpoAIPrivacyInfo, ExpoAIPrivacyMode, ExpoAIProvider } from "./types.js";

/** Recommended, human-facing copy for each privacy mode. */
export const PRIVACY_COPY: Record<ExpoAIPrivacyMode, string> = {
  "on-device": "Processed privately on this device.",
  "apple-private-cloud-compute": "Processed using Apple Private Cloud Compute.",
  "third-party-cloud": "Processed using a configured cloud AI provider.",
  unknown: "Processing location is unknown.",
};

export function privacyModeForProvider(provider: ExpoAIProvider): ExpoAIPrivacyMode {
  switch (provider) {
    case "apple-foundation-models":
    case "android-aicore-gemini-nano":
    case "litert-lm":
      return "on-device";
    case "apple-private-cloud-compute":
      return "apple-private-cloud-compute";
    case "cloud":
      return "third-party-cloud";
    case "system-preferred":
    case "none":
    default:
      return "unknown";
  }
}

/** True when using this provider transmits the prompt off the device. */
export function providerSendsPromptOffDevice(provider: ExpoAIProvider): boolean {
  const mode = privacyModeForProvider(provider);
  return mode === "third-party-cloud" || mode === "apple-private-cloud-compute";
}

export function privacyInfoForProvider(provider: ExpoAIProvider): ExpoAIPrivacyInfo {
  const privacyMode = privacyModeForProvider(provider);
  return {
    provider,
    isOnDevice: privacyMode === "on-device",
    sendsPromptOffDevice:
      privacyMode === "third-party-cloud" || privacyMode === "apple-private-cloud-compute",
    privacyMode,
  };
}

/** Convenience: the UI copy string for a provider. */
export function privacyCopyForProvider(provider: ExpoAIProvider): string {
  return PRIVACY_COPY[privacyModeForProvider(provider)];
}
