/**
 * @stewmore/expo-ai-apple-foundation-models
 *
 * Registers the Apple Foundation Models adapters with the Expo AI Runtime. Import
 * this package once in your app (`import "@stewmore/expo-ai-apple-foundation-models"`)
 * to make the iOS on-device provider and Apple Private Cloud Compute (PCC)
 * available to {@link ExpoAI}. PCC is off-device, so the router only reaches it
 * through `fallback` or an explicit `provider`.
 *
 * Importing on a non-iOS platform (or before `expo prebuild`) is a safe no-op:
 * always-unavailable adapters are registered instead of touching the native
 * module. The native-event bridge, capability gating, and error normalization
 * all live in the shared `createNativeAdapter` helper in `@stewmore/expo-ai-core`.
 */

import {
  createNativeAdapter,
  createUnavailableNativeAdapter,
  notifyAvailabilityChange,
  registerAdapter,
  type ExpoAIAdapter,
  type NativeCapabilityProfile,
  type NativeStreamingModule,
} from '@stewmore/expo-ai-core';
import { AppState, Platform } from 'react-native';

import { NativeApple, type AppleNativeModule, type PCCQuota } from './native.js';

const PROVIDER = 'apple-foundation-models' as const;
const PCC_PROVIDER = 'apple-private-cloud-compute' as const;

// No `contextWindow`: native reports the real size with availability.
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
};

const PCC_PROFILE: NativeCapabilityProfile = {
  ...CAPABILITY_PROFILE,
  isOnDevice: false,
  sendsPromptOffDevice: true,
};

/**
 * The same native module bound to PCC: availability comes from
 * `getPCCAvailability`, and calls that pick a model get `model: 'pcc'`. Each
 * method is wrapped explicitly because spreading a JSI host object does not
 * copy its methods.
 */
function pccNative(n: AppleNativeModule): NativeStreamingModule {
  const pcc = (options: Record<string, unknown>) => ({ ...options, model: 'pcc' });
  return {
    getAvailability: () => n.getPCCAvailability!(),
    generate: (options) => n.generate(pcc(options)),
    generateObject: (options) => n.generateObject!(pcc(options)),
    createSession: (options) => n.createSession!(pcc(options)),
    generateInSession: (sessionId, options) => n.generateInSession!(sessionId, options),
    resetSession: (sessionId) => n.resetSession!(sessionId),
    disposeSession: (sessionId) => n.disposeSession!(sessionId),
    startStreaming: (requestId, options) => n.startStreaming(requestId, pcc(options)),
    cancelStreaming: (requestId) => n.cancelStreaming(requestId),
    cancel: (requestId) => n.cancel!(requestId),
    prewarm: (options) => n.prewarm!(pcc(options)),
    prewarmSession: (sessionId, options) => n.prewarmSession!(sessionId, options),
    addListener: (eventName, listener) => n.addListener(eventName, listener),
  };
}

const ios = Platform.OS === 'ios';

export const appleFoundationModelsAdapter: ExpoAIAdapter =
  ios && NativeApple
    ? createNativeAdapter(NativeApple, {
        provider: PROVIDER,
        capabilityProfile: CAPABILITY_PROFILE,
      })
    : createUnavailableNativeAdapter(PROVIDER, ios ? 'missing_dependency' : 'unsupported_device');

export const applePrivateCloudComputeAdapter: ExpoAIAdapter =
  ios && NativeApple?.getPCCAvailability
    ? createNativeAdapter(pccNative(NativeApple), {
        provider: PCC_PROVIDER,
        capabilityProfile: PCC_PROFILE,
      })
    : createUnavailableNativeAdapter(
        PCC_PROVIDER,
        ios ? 'missing_dependency' : 'unsupported_device',
      );

registerAdapter(appleFoundationModelsAdapter);
registerAdapter(applePrivateCloudComputeAdapter);

// Apple Intelligence, model assets, and PCC quota can change while backgrounded;
// re-probe when the app returns to the foreground.
if (ios && NativeApple) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      notifyAvailabilityChange(PROVIDER);
      notifyAvailabilityChange(PCC_PROVIDER);
    }
  });
}

/** Token count for `text` with the on-device model, or null where unsupported (below iOS 26.4). */
export async function countTokens(text: string): Promise<number | null> {
  return (await NativeApple?.countTokens?.(text)) ?? null;
}

/** Current PCC usage quota, or null when PCC is not set up or unsupported. */
export async function getPCCQuota(): Promise<PCCQuota | null> {
  return (await NativeApple?.getPCCQuota?.()) ?? null;
}

/** Show the system sheet to request a higher PCC limit. Resolves false when it could not be shown. */
export async function showPCCLimitIncrease(): Promise<boolean> {
  return (await NativeApple?.showPCCLimitIncrease?.()) ?? false;
}

export * from './native.js';
