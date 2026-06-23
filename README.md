# Expo AI Runtime

[![CI](https://github.com/stewartmoreland/expo-ai-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/stewartmoreland/expo-ai-runtime/actions/workflows/ci.yml)
[![Native](https://github.com/stewartmoreland/expo-ai-runtime/actions/workflows/native.yml/badge.svg)](https://github.com/stewartmoreland/expo-ai-runtime/actions/workflows/native.yml)
[![codecov](https://codecov.io/gh/stewartmoreland/expo-ai-runtime/branch/main/graph/badge.svg)](https://codecov.io/gh/stewartmoreland/expo-ai-runtime)
[![skills.sh](https://skills.sh/b/stewartmoreland/expo-ai-runtime)](https://skills.sh/stewartmoreland/expo-ai-runtime)

A **mobile-native AI runtime** for Expo and React Native. One TypeScript API over:

- **Apple Foundation Models** (on-device, iOS 26+)
- **Android Gemini Nano** via ML Kit GenAI / AICore (on-device)
- An explicit, app-controlled **cloud fallback**

…with runtime **capability detection**, **normalized errors**, **privacy metadata on every result**, **sessions**, **streaming**, and **structured output**.

> This is the v1 provider layer described in [`docs/prd.md`](docs/prd.md) — a reliable way to call the best available native or local model from a React Native app. It is intentionally _not_ an agent framework yet.

## Packages

| Package                                                                                 | What it is                                                                                                                                                                             | Version |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [`@stewmore/expo-ai-core`](packages/expo-ai-core)                                       | Pure-TS heart: public `ExpoAI` API, adapter contract, provider router, capability registry, sessions, structured-output validation/repair, privacy, normalized errors. No native code. | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-core)
| [`@stewmore/expo-ai-react`](packages/expo-ai-react)                                     | React hooks for the `ExpoAI` API.                                                                                                                              | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-react)
| [`@stewmore/expo-ai-apple-foundation-models`](packages/expo-ai-apple-foundation-models) | iOS adapter wrapping Apple's `FoundationModels` framework (Swift).                                                                                                                     | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-apple-foundation-models)
| [`@stewmore/expo-ai-android-aicore`](packages/expo-ai-android-aicore)                   | Android adapter wrapping ML Kit GenAI / Gemini Nano via AICore (Kotlin).                                                                                                               | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-android-aicore)
| [`@stewmore/expo-ai-cloud`](packages/expo-ai-cloud)                                     | Cloud fallback client adapter (configurable endpoint, streaming via `expo/fetch`).                                                                                                     | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-cloud)
| [`@stewmore/expo-ai-evals`](packages/expo-ai-evals)                                     | Node-first evaluation harness (quality, schema validity, latency, fallback frequency).                                                                                                 | ![NPM Version](https://img.shields.io/npm/v/@stewmore/expo-ai-evals)

## Examples

| App                                                        | Demonstrates                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`examples/basic-generate`](examples/basic-generate)       | Capability card + prompt → `ExpoAI.generate`, provider + privacy badge, errors. |
| [`examples/structured-output`](examples/structured-output) | `ExpoAI.generateObject` with a JSON schema.                                     |
| [`examples/streaming-chat`](examples/streaming-chat)       | `ExpoAI.stream` with live tokens + cancel.                                      |
| [`examples/cloud-fallback`](examples/cloud-fallback)       | Explicit cloud routing, sensitivity gating, privacy disclosure.                 |
| [`examples/server`](examples/server)                       | Reference cloud backend (mock-by-default).                                      |

## Quick start

```ts
import { ExpoAI } from '@stewmore/expo-ai-core';
import '@stewmore/expo-ai-apple-foundation-models'; // registers the iOS adapter
import '@stewmore/expo-ai-android-aicore'; // registers the Android adapter

const caps = await ExpoAI.getCapabilities();
if (caps.available) {
  const result = await ExpoAI.generate({
    prompt: 'Summarize this note in five bullets.',
    fallback: 'cloud',
  });
  console.log(result.text, result.provider, result.privacy.privacyMode);
}
```

## Development

```bash
npm install                 # install the whole workspace
npm test                    # run unit tests (core, cloud, evals)
npm run typecheck           # type-check all packages
npm run build               # build all packages
npm run eval                # run the eval harness against the mock cloud + a mock adapter
npm run server              # start the reference cloud backend (mock mode)
```

Example apps use **custom native code**, so they require a **development build** (not Expo Go):

```bash
cd examples/basic-generate
npx expo prebuild
npx expo run:ios       # iOS 26 simulator (Apple Silicon) with Apple Intelligence enabled
npx expo run:android   # supported device for on-device; otherwise cloud fallback
```

See [`docs/prd.md`](docs/prd.md) for the full product definition and roadmap.

## Use as an agent skill

This repo ships an [agent skill](skills/expo-ai-runtime) that teaches AI coding agents how to
build with this runtime — wiring providers, capability detection, structured output, sessions,
and the privacy-aware routing rules. Add it to your agent with the [skills](https://skills.sh) CLI:

```bash
npx skills add stewartmoreland/expo-ai-runtime
```

## License

MIT
