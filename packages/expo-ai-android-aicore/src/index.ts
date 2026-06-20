/**
 * @stewmore/expo-ai-android-aicore
 *
 * Registers the Android Gemini Nano (ML Kit GenAI / AICore) adapter with the
 * Expo AI Runtime. Import this package once in your app
 * (`import "@stewmore/expo-ai-android-aicore"`) to make the Android on-device
 * provider available to {@link ExpoAI}.
 *
 * Importing on a non-Android platform (or before `expo prebuild`) is a safe
 * no-op. The native-event bridge, capability gating, and error normalization all
 * live in the shared `createNativeAdapter` helper in `@stewmore/expo-ai-core`.
 */

import {
  ExpoAIError,
  createNativeAdapter,
  createUnavailableNativeAdapter,
  registerAdapter,
  type ExpoAIAdapter,
  type NativeCapabilityProfile,
} from "@stewmore/expo-ai-core";
import { Platform } from "react-native";

import { NativeAndroid } from "./native.js";

const PROVIDER = "android-aicore-gemini-nano" as const;

const CAPABILITY_PROFILE: NativeCapabilityProfile = {
  isOnDevice: true,
  isSystemManagedModel: true,
  sendsPromptOffDevice: false,
  supportsTextGeneration: true,
  supportsStreaming: true,
  supportsSessions: true,
  // Structured output and task helpers are emulated by the core runtime.
  supportsStructuredOutput: true,
  supportsTools: false,
  supportsImageInput: false,
  supportsSpeechInput: false,
  supportsSummarization: true,
  supportsRewrite: true,
  supportsProofreading: true,
  supportsBringYourOwnModel: false,
  supportsModelDownload: true,
  contextWindow: 4096,
};

export const androidAICoreAdapter: ExpoAIAdapter =
  Platform.OS === "android" && NativeAndroid
    ? createNativeAdapter(NativeAndroid, { provider: PROVIDER, capabilityProfile: CAPABILITY_PROFILE })
    : createUnavailableNativeAdapter(
        PROVIDER,
        Platform.OS === "android" ? "missing_dependency" : "unsupported_device",
      );

registerAdapter(androidAICoreAdapter);

/**
 * Trigger (or await) the on-device Gemini Nano model download. Resolves when the
 * model is ready; rejects with an {@link ExpoAIError} on failure. No-op off
 * Android.
 */
export async function downloadGeminiNanoModel(): Promise<void> {
  if (Platform.OS !== "android" || !NativeAndroid) {
    throw new ExpoAIError({
      code: "UNSUPPORTED_DEVICE",
      provider: PROVIDER,
      message: "Gemini Nano model download is only available on Android.",
    });
  }
  try {
    await NativeAndroid.downloadModel();
  } catch (error) {
    throw ExpoAIError.from(error, PROVIDER);
  }
}

export * from "./native.js";
