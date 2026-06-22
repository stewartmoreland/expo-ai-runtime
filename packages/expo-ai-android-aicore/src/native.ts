import type { NativeStreamingModule } from '@stewmore/expo-ai-core';
import { requireOptionalNativeModule } from 'expo';

export interface ExpoAICoreNativeModule extends NativeStreamingModule {
  /** Trigger / await the on-device Gemini Nano model download. */
  downloadModel(): Promise<{ ok: boolean }>;
}

/** The Android ML Kit GenAI native module, or null when not linked. */
export const NativeAndroid = requireOptionalNativeModule<ExpoAICoreNativeModule>('ExpoAICore');
