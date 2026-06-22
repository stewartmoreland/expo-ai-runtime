<!--
Thanks for contributing to the Expo AI Runtime!
Keep the public API stable and the core pure-TS (no React Native / native imports in expo-ai-core).
See CLAUDE.md and docs/prd.md for conventions.
-->

## Summary

<!-- What does this change and why? Link the issue it closes. -->

Closes #

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (public API or adapter contract)
- [ ] Docs / examples
- [ ] Chore / tooling / CI

## Affected packages

- [ ] `@stewmore/expo-ai-core`
- [ ] `expo-ai-apple-foundation-models` (iOS)
- [ ] `expo-ai-android-aicore` (Android)
- [ ] `@stewmore/expo-ai-cloud`
- [ ] `@stewmore/expo-ai-evals`
- [ ] examples / docs

## How was this tested?

<!-- Unit (vitest), typecheck, and where relevant a device/simulator run. Note the platform + provider exercised. -->

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] Manual device/simulator run (platform + provider: \_\_\_\_)

## Checklist

- [ ] `expo-ai-core` stays pure TypeScript (no React Native / native imports)
- [ ] Provider/native errors are normalized to `ExpoAIError` at the boundary
- [ ] Results carry `provider` + `privacy` metadata; no sensitive prompt leaves the device silently
- [ ] Importing a provider package on the wrong platform stays a no-op (never throws)
- [ ] Docs / examples updated if public behavior changed
