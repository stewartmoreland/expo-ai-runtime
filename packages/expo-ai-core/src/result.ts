/**
 * Shapes an {@link AdapterGenerateResult} into the public {@link GenerateResult},
 * stamping provider + privacy metadata (docs/prd.md §14, §20.4).
 */

import type { AdapterGenerateResult } from "./adapter.js";
import { privacyInfoForProvider } from "./privacy.js";
import type { ExpoAIProvider, GenerateResult } from "./types.js";

export function finalizeResult(
  result: AdapterGenerateResult,
  provider: ExpoAIProvider,
  usedFallback: boolean,
): GenerateResult {
  const final: GenerateResult = {
    text: result.text,
    provider,
    privacy: privacyInfoForProvider(provider),
    usedFallback,
  };
  if (result.finishReason !== undefined) final.finishReason = result.finishReason;
  if (result.usage !== undefined) final.usage = result.usage;
  if (result.raw !== undefined) final.raw = result.raw;
  return final;
}
