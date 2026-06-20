# Expo AI Runtime — agent notes

Mobile-native AI runtime for Expo/React Native. Monorepo (npm workspaces). See `docs/prd.md` for the product spec.

## Layout

- `packages/expo-ai-core` — pure-TS core (`@stewmore/expo-ai-core`). Owns the public `ExpoAI` API, the `ExpoAIAdapter` contract, the provider router, capability registry, sessions, structured-output validation/repair, privacy, and normalized errors. **No React Native / native imports** — keep it pure so it unit-tests in Node.
- `packages/expo-ai-apple-foundation-models` — iOS-only Expo native module (Swift, `FoundationModels`).
- `packages/expo-ai-android-aicore` — Android-only Expo native module (Kotlin, ML Kit GenAI).
- `packages/expo-ai-cloud` — cloud fallback client adapter (pure TS).
- `packages/expo-ai-evals` — Node eval harness (pure TS).
- `examples/*` — focused Expo apps + a reference cloud server.

## Conventions

- Provider packages register their adapter at **import time**, guarded by `Platform.OS`. Importing a package on the wrong platform must be a no-op (register an always-unavailable adapter), never throw in `requireNativeModule`.
- All provider/native errors are normalized to `ExpoAIError` (`code`, `provider`, `retryable`, `fallbackRecommended`) at the boundary.
- Every `GenerateResult` carries `provider` + `privacy` metadata. Never silently send a `sensitive` prompt off-device.
- Native methods stay primitive (PRD §9); ergonomics live in TypeScript.

## Commands

```bash
npm install            # install workspace
npm test               # unit tests (core, cloud, evals) — vitest
npm run typecheck      # tsc --noEmit per package
npm run build          # build all packages
npm run eval           # eval harness (needs the reference server in mock mode, or uses the mock adapter)
npm run server         # start reference cloud backend (mock mode, no API keys needed)
```

Per-package: `npm test -w @stewmore/expo-ai-core`, etc.

## Pure-TS package tooling

`expo-ai-core`, `expo-ai-cloud`, `expo-ai-evals` build with `tsc` and test with **vitest** (no React Native imports). The two native packages use `expo-module-scripts` (scaffolded).

## Example apps

Custom native code → **development build required** (not Expo Go): `npx expo prebuild && npx expo run:ios|run:android`. Prebuilt `ios/`/`android/` folders are gitignored and regenerated on demand.
