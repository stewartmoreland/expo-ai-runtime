---
id: intro
title: Introduction
sidebar_position: 1
slug: /intro
---

# Expo AI Runtime

A **mobile-native AI runtime** for Expo and React Native. One TypeScript API over:

- **Apple Foundation Models** (on-device, iOS 26+)
- **Android Gemini Nano** via ML Kit GenAI / AICore (on-device)
- An explicit, app-controlled **cloud fallback**

…with runtime **capability detection**, **normalized errors**, **privacy metadata on
every result**, **sessions**, **streaming**, and **structured output**.

:::info[This is a provider layer, not an agent framework]
This is the v1 provider layer — a reliable way to call the best available native or
local model from a React Native app. It is intentionally *not* an agent framework yet.
See the [roadmap](./reference/roadmap.md) for where it's headed.
:::

## Packages

| Package | What it is |
| --- | --- |
| [`@stewmore/expo-ai-core`](./packages/core.md) | Pure-TS heart: public `ExpoAI` API, adapter contract, provider router, capability registry, sessions, structured-output validation/repair, privacy, normalized errors. No native code. |
| [`@stewmore/expo-ai-apple-foundation-models`](./packages/apple-foundation-models.md) | iOS adapter wrapping Apple's `FoundationModels` framework (Swift). |
| [`@stewmore/expo-ai-android-aicore`](./packages/android-aicore.md) | Android adapter wrapping ML Kit GenAI / Gemini Nano via AICore (Kotlin). |
| [`@stewmore/expo-ai-cloud`](./packages/cloud.md) | Cloud fallback client adapter (configurable endpoint, streaming via `expo/fetch`). |
| [`@stewmore/expo-ai-evals`](./packages/evals.md) | Node-first evaluation harness (quality, schema validity, latency, fallback frequency). |

## Next steps

- [Install](./getting-started/installation.md) the packages your app needs.
- Follow the [quick start](./getting-started/quick-start.md) for your first generation.
- Read the [concepts](./concepts/architecture.md) to understand routing, capabilities,
  privacy, and structured output.
