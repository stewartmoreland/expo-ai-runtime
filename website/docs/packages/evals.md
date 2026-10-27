---
id: evals
title: Evals harness
sidebar_position: 5
---

# @stewmore/expo-ai-evals

A Node-first evaluation harness for the runtime. Add it early — even a simple suite
catches regressions across providers.

```bash
npm install --save-dev @stewmore/expo-ai-evals
```

## Purpose

- Compare provider output quality.
- Verify schema validity.
- Track latency.
- Track fallback frequency.
- Test privacy boundaries.
- Detect SDK regressions.

## Result shape

```ts
export type EvalResult = {
  provider: ExpoAIProvider;
  testName: string;
  passed: boolean;
  latencyMs: number;
  usedFallback: boolean;
  schemaValid?: boolean;
  errorCode?: ExpoAIErrorCode;
};
```

The harness runs against mock adapters, so it needs no API keys or devices:

```bash
npm run eval                                   # from the repo root
npm run eval -- --providers apple-foundation-models,cloud --fallback cloud
```

- **`--providers`** — comma-separated providers to register a mock adapter for (default
  `apple-foundation-models`).
- **`--fallback`** — `none` (default), `cloud`, or `any`; applies to cases that don't set
  their own `fallback`. `runEvalSuite` also defaults to `'none'`, matching the runtime.
- With `ENDPOINT` set, `cloud` uses the real [reference server](../examples/reference-server.md)
  through `@stewmore/expo-ai-cloud`. That package is an **optional peer dependency**:
  install it only if you eval against a cloud backend.
