import type { NativeAvailability, NativeStreamingModule } from '@stewmore/expo-ai-core';
import { requireOptionalNativeModule } from 'expo';

/** Apple Private Cloud Compute usage quota (`resetDate` is ms since epoch). */
export type PCCQuota = {
  status: 'below_limit' | 'limit_reached';
  isApproachingLimit: boolean;
  resetDate: number | null;
  canRequestLimitIncrease: boolean;
};

/** The `ExpoAIApple` module: the shared native surface plus Apple-only extras. */
export interface AppleNativeModule extends NativeStreamingModule {
  countTokens?(text: string): Promise<number | null>;
  getPCCAvailability?(): Promise<NativeAvailability>;
  getPCCQuota?(): Promise<PCCQuota | null>;
  showPCCLimitIncrease?(): Promise<boolean>;
}

/** The Apple FoundationModels native module, or null when not linked. */
export const NativeApple = requireOptionalNativeModule<AppleNativeModule>('ExpoAIApple');
