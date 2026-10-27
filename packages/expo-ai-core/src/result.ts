/**
 * Shapes an {@link AdapterGenerateResult} into the public {@link GenerateResult},
 * stamping provider + privacy metadata (docs/prd.md §14, §20.4).
 */

import type { AdapterGenerateResult, AdapterUsage } from './adapter.js';
import { privacyInfoForProvider } from './privacy.js';
import type { ValidatedObjectResult } from './structured-output.js';
import type { ExpoAIProvider, ExpoAIUsage, GenerateResult } from './types.js';

export const USAGE_COUNTS = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cachedInputTokens',
  'reasoningTokens',
] as const;

/** Stamp a `source` on adapter usage: `'provider'` when any count is present, else `'unavailable'`. */
export function normalizeUsage(usage: AdapterUsage | undefined): ExpoAIUsage {
  if (!usage || !USAGE_COUNTS.some((key) => typeof usage[key] === 'number')) {
    return { source: 'unavailable' };
  }
  return { ...usage, source: usage.source ?? 'provider' };
}

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
    usage: normalizeUsage(result.usage),
  };
  if (result.finishReason !== undefined) final.finishReason = result.finishReason;
  if (result.raw !== undefined) final.raw = result.raw;
  return final;
}

/** {@link finalizeResult} for a validated object: carries usage and `structured` meta. */
export function finalizeObjectResult(
  validated: ValidatedObjectResult,
  provider: ExpoAIProvider,
  usedFallback: boolean,
): GenerateResult {
  const final = finalizeResult(
    { text: validated.raw, raw: validated.object, usage: validated.usage },
    provider,
    usedFallback,
  );
  final.structured = {
    mode: validated.mode,
    attempts: validated.attempts,
    usedRepair: validated.usedRepair,
  };
  return final;
}
