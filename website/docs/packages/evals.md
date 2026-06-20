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

The harness runs against the mock cloud server and a mock adapter, so it needs no API
keys or devices:

```bash
npm run eval     # from the repo root
```
