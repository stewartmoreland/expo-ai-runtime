import type { NativeStreamingModule } from "@stewmore/expo-ai-core";
import { requireOptionalNativeModule } from "expo";

/** The Apple FoundationModels native module, or null when not linked. */
export const NativeApple = requireOptionalNativeModule<NativeStreamingModule>("ExpoAIApple");
