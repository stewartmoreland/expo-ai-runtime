import type {
  ExpoAIErrorCode,
  ExpoAIFallback,
  ExpoAIProvider,
  JSONSchema,
} from '@stewmore/expo-ai-core';

export type EvalKind = 'generate' | 'object' | 'summarize' | 'rewrite' | 'proofread' | 'privacy';

export type EvalCase = {
  name: string;
  kind: EvalKind;
  prompt?: string;
  text?: string;
  schema?: JSONSchema;
  style?: string;
  length?: 'short' | 'medium' | 'long';
  provider?: ExpoAIProvider;
  fallback?: ExpoAIFallback;
  sensitive?: boolean;
  /** Case-insensitive substrings the output must contain to pass. */
  contains?: string[];
};

/** One evaluation outcome (docs/prd.md §17). */
export type EvalResult = {
  provider: ExpoAIProvider;
  testName: string;
  passed: boolean;
  latencyMs: number;
  usedFallback: boolean;
  schemaValid?: boolean;
  errorCode?: ExpoAIErrorCode;
  detail?: string;
};

export type EvalSuiteResult = {
  results: EvalResult[];
  passed: number;
  failed: number;
  total: number;
};
