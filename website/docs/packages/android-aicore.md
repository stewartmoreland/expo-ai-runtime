---
id: android-aicore
title: Android AICore
sidebar_position: 3
---

# @stewmore/expo-ai-android-aicore

Android **Gemini Nano** via ML Kit GenAI / **AICore** (on-device) provider for the Expo
AI Runtime.

## Install & use

```ts
import { ExpoAI } from "@stewmore/expo-ai-core";
import "@stewmore/expo-ai-android-aicore"; // registers the Android adapter (side-effect import)

const caps = await ExpoAI.getCapabilities();
if (caps.available && caps.provider === "android-aicore-gemini-nano") {
  const result = await ExpoAI.generate({ prompt: "Write a haiku about Kotlin." });
  console.log(result.text); // privacy: on-device
}
```

If the model isn't downloaded yet, the availability reason is `model_not_downloaded` —
trigger a download:

```ts
import { downloadGeminiNanoModel } from "@stewmore/expo-ai-android-aicore";
await downloadGeminiNanoModel();
```

## Requirements

- A device with **AICore / Gemini Nano** (e.g. recent Pixel and Galaxy flagships),
  **Android API 26+**.
- A **development build** (custom native code — not Expo Go):
  `npx expo prebuild && npx expo run:android`.

AICore is system-managed and may still be initializing — the adapter surfaces
`model_initializing` / `aicore_unavailable` (retryable) so the runtime can fall back per
the app's policy.

## What it maps

| Runtime | ML Kit GenAI |
| --- | --- |
| `generate` | Prompt API `GenerativeModel.generateContent` |
| `stream` | `generateContentStream` (`Flow`) → token deltas |
| capability detection | `checkStatus()` → `FeatureStatus` |
| model download | `download()` (`downloadGeminiNanoModel`) |
| sessions | emulated (transcript replayed as prompt prefix — the Prompt API is stateless) |
| errors | `GenAiException.errorCode` → `ExpoAIError` |

Structured output and summarize/rewrite/proofread are provided by the core runtime over
`generate` (JSON prompt + validate + repair).

:::note
The `com.google.mlkit:genai-prompt` API is beta; bump the dependency version and confirm
symbol names against the installed SDK when building.
:::
