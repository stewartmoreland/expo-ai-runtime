---
slug: initial-release
title: Expo AI Runtime — first cut
authors: [stewmore]
tags: [release, core, native]
---

The first cut of the Expo AI Runtime is here: one TypeScript API over Apple Foundation
Models, Android Gemini Nano, and an explicit cloud fallback.

{/_ truncate _/}

## What's in this release

- **`@stewmore/expo-ai-core`** — the `ExpoAI` API, provider router, capability registry,
  sessions, structured-output validation/repair, privacy metadata, and normalized errors.
- **`@stewmore/expo-ai-apple-foundation-models`** — on-device iOS provider (iOS 26+).
- **`@stewmore/expo-ai-android-aicore`** — on-device Android provider (Gemini Nano via
  AICore), with model download.
- **`@stewmore/expo-ai-cloud`** — opt-in cloud fallback client adapter.
- **`@stewmore/expo-ai-evals`** — Node-first eval harness.

Built on Expo SDK 56. See the [roadmap](/docs/reference/roadmap) for what's next —
streaming hardening, task APIs, LiteRT-LM bring-your-own-model, and beyond.
