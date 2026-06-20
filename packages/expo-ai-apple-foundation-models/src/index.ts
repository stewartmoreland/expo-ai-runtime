/**
 * @stewmore/expo-ai-apple-foundation-models
 *
 * Registers the Apple Foundation Models adapter with the Expo AI Runtime. Import
 * this package once in your app (`import "@stewmore/expo-ai-apple-foundation-models"`)
 * to make the iOS on-device provider available to {@link ExpoAI}.
 *
 * Importing on a non-iOS platform (or before `expo prebuild`) is a safe no-op:
 * an always-unavailable adapter is registered instead of touching the native
 * module. The native-event bridge, capability gating, and error normalization
 * all live in the shared `createNativeAdapter` helper in `@stewmore/expo-ai-core`.
 */

import {
  createNativeAdapter,
  createUnavailableNativeAdapter,
  registerAdapter,
  type ExpoAIAdapter,
  type NativeCapabilityProfile,
} from "@stewmore/expo-ai-core";
import { Platform } from "react-native";

import { NativeApple } from "./native.js";

const PROVIDER = "apple-foundation-models" as const;

const CAPABILITY_PROFILE: NativeCapabilityProfile = {
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

export const appleFoundationModelsAdapter: ExpoAIAdapter =
  Platform.OS === "ios" && NativeApple
    ? createNativeAdapter(NativeApple, { provider: PROVIDER, capabilityProfile: CAPABILITY_PROFILE })
    : createUnavailableNativeAdapter(
        PROVIDER,
        Platform.OS === "ios" ? "missing_dependency" : "unsupported_device",
      );

registerAdapter(appleFoundationModelsAdapter);

export * from "./native.js";
