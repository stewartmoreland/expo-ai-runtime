import type { ExpoAIProvider } from '@stewmore/expo-ai-core';

import { runEvalCase } from './runEvalSuite.js';
import type { EvalCase, EvalResult } from './types.js';

/**
 * Run the same cases forced through each provider, so output quality / latency /
 * schema validity can be compared side by side (docs/prd.md §17). Privacy cases
 * are provider-agnostic and skipped here.
 */
export async function compareProviders(
  cases: EvalCase[],
  providers: ExpoAIProvider[],
): Promise<Record<string, EvalResult[]>> {
  const comparison: Record<string, EvalResult[]> = {};
  for (const provider of providers) {
    const results: EvalResult[] = [];
    for (const testCase of cases) {
      if (testCase.kind === 'privacy') continue;
      results.push(await runEvalCase({ ...testCase, provider }));
    }
    comparison[provider] = results;
  }
  return comparison;
}
