/**
 * Eval runner (docs/prd.md §17).
 *
 * Runs cases through the public ExpoAI API against whatever adapters are
 * registered, measuring latency, fallback usage, schema validity, and — for
 * "privacy" cases — that sensitive prompts are not leaked to a third-party cloud.
 */

import {
  ExpoAI,
  ExpoAIError,
  clearAdapters,
  getAdapters,
  registerAdapter,
  routeGenerateObjectWithMeta,
} from '@stewmore/expo-ai-core';
import { createMockAdapter } from '@stewmore/expo-ai-core/testing';
import type { RewriteStyle } from '@stewmore/expo-ai-core';

import { scoreSchemaValidity } from './scoreSchemaValidity.js';
import type { EvalCase, EvalResult, EvalSuiteResult } from './types.js';

function elapsed(start: number): number {
  return Math.round((performance.now() - start) * 100) / 100;
}

function containsOk(text: string, contains?: string[]): boolean {
  if (!contains || contains.length === 0) return true;
  const haystack = text.toLowerCase();
  return contains.every((needle) => haystack.includes(needle.toLowerCase()));
}

export async function runEvalCase(testCase: EvalCase): Promise<EvalResult> {
  const start = performance.now();
  try {
    switch (testCase.kind) {
      case 'object': {
        if (!testCase.schema)
          throw new Error(`case "${testCase.name}" is kind=object but has no schema`);
        const meta = await routeGenerateObjectWithMeta({
          prompt: testCase.prompt ?? '',
          schema: testCase.schema,
          fallback: testCase.fallback ?? 'cloud',
          ...(testCase.provider ? { provider: testCase.provider } : {}),
        });
        const schemaValid = scoreSchemaValidity(meta.object, testCase.schema);
        return {
          provider: meta.result.provider,
          testName: testCase.name,
          passed: schemaValid && containsOk(JSON.stringify(meta.object), testCase.contains),
          latencyMs: elapsed(start),
          usedFallback: meta.result.usedFallback,
          schemaValid,
        };
      }

      case 'summarize': {
        const result = await ExpoAI.summarize({
          text: testCase.text ?? '',
          fallback: testCase.fallback ?? 'cloud',
          ...(testCase.provider ? { provider: testCase.provider } : {}),
          ...(testCase.length ? { length: testCase.length } : {}),
        });
        return functionalResult(testCase, result.provider, result.text, result.usedFallback, start);
      }

      case 'rewrite': {
        const result = await ExpoAI.rewrite({
          text: testCase.text ?? '',
          fallback: testCase.fallback ?? 'cloud',
          ...(testCase.provider ? { provider: testCase.provider } : {}),
          ...(testCase.style ? { style: testCase.style as RewriteStyle } : {}),
        });
        return functionalResult(testCase, result.provider, result.text, result.usedFallback, start);
      }

      case 'proofread': {
        const result = await ExpoAI.proofread({
          text: testCase.text ?? '',
          fallback: testCase.fallback ?? 'cloud',
          ...(testCase.provider ? { provider: testCase.provider } : {}),
        });
        return functionalResult(testCase, result.provider, result.text, result.usedFallback, start);
      }

      case 'privacy':
        return await runPrivacyCase(testCase, start);

      case 'generate':
      default: {
        const result = await ExpoAI.generate({
          prompt: testCase.prompt ?? '',
          fallback: testCase.fallback ?? 'cloud',
          ...(testCase.provider ? { provider: testCase.provider } : {}),
          ...(testCase.sensitive ? { sensitive: true } : {}),
        });
        return functionalResult(testCase, result.provider, result.text, result.usedFallback, start);
      }
    }
  } catch (error) {
    const err = ExpoAIError.from(error, testCase.provider ?? 'none');
    return {
      provider: testCase.provider ?? 'none',
      testName: testCase.name,
      passed: false,
      latencyMs: elapsed(start),
      usedFallback: false,
      errorCode: err.code,
      detail: err.message,
    };
  }
}

function functionalResult(
  testCase: EvalCase,
  provider: EvalResult['provider'],
  text: string,
  usedFallback: boolean,
  start: number,
): EvalResult {
  return {
    provider,
    testName: testCase.name,
    passed: text.length > 0 && containsOk(text, testCase.contains),
    latencyMs: elapsed(start),
    usedFallback,
  };
}

/**
 * Privacy boundary: with ONLY a cloud adapter available, a sensitive prompt must
 * be refused rather than leaked. Passing means the runtime threw UNAVAILABLE.
 */
async function runPrivacyCase(testCase: EvalCase, start: number): Promise<EvalResult> {
  const saved = getAdapters();
  clearAdapters();
  registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: 'LEAKED' }));
  try {
    await ExpoAI.generate({
      prompt: testCase.prompt ?? 'secret',
      sensitive: true,
      fallback: testCase.fallback ?? 'any',
    });
    return {
      provider: 'cloud',
      testName: testCase.name,
      passed: false,
      latencyMs: elapsed(start),
      usedFallback: false,
      detail: 'sensitive prompt was NOT blocked (leaked to cloud)',
    };
  } catch (error) {
    const err = ExpoAIError.from(error, 'none');
    const passed = err.code === 'UNAVAILABLE';
    return {
      provider: 'none',
      testName: testCase.name,
      passed,
      latencyMs: elapsed(start),
      usedFallback: false,
      errorCode: err.code,
      detail: passed ? 'sensitive prompt correctly blocked' : err.message,
    };
  } finally {
    clearAdapters();
    for (const adapter of saved) registerAdapter(adapter);
  }
}

export async function runEvalSuite(cases: EvalCase[]): Promise<EvalSuiteResult> {
  const results: EvalResult[] = [];
  for (const testCase of cases) {
    results.push(await runEvalCase(testCase));
  }
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, failed: results.length - passed, total: results.length };
}
