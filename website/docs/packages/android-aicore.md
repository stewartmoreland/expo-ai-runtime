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
import { ExpoAI } from '@stewmore/expo-ai-core';
import '@stewmore/expo-ai-android-aicore'; // registers the Android adapter (side-effect import)

const caps = await ExpoAI.getCapabilities();
if (caps.available && caps.provider === 'android-aicore-gemini-nano') {
  const result = await ExpoAI.generate({ prompt: 'Write a haiku about Kotlin.' });
  console.log(result.text); // privacy: on-device
}
```

If the model isn't downloaded yet, the availability reason is `model_not_downloaded` —
trigger a download:

```ts
import { downloadGeminiNanoModel } from '@stewmore/expo-ai-android-aicore';
await downloadGeminiNanoModel();
```

## Config plugin

The native module autolinks on its own, but add the config plugin so `expo prebuild`
also raises the project's `minSdkVersion` to the AICore floor (26):

```json title="app.json"
{
  "expo": {
    "plugins": [["@stewmore/expo-ai-android-aicore", { "minSdkVersion": 31 }]]
  }
}
```

- `minSdkVersion` — optional; defaults to `26`. Set it if your app already targets a
  higher API.

## Requirements

- A device with **AICore / Gemini Nano** (e.g. recent Pixel and Galaxy flagships),
  **Android API 26+**.
- A **development build** (custom native code — not Expo Go):
  `npx expo prebuild && npx expo run:android`.

AICore is system-managed and may still be initializing — the adapter surfaces
`model_initializing` / `aicore_unavailable` (retryable) so the runtime can fall back per
the app's policy.

Availability is re-probed when the app returns to the foreground and after
`downloadGeminiNanoModel()` resolves, so
[`ExpoAI.onAvailabilityChange`](../concepts/capabilities.mdx#reacting-to-changes) (and
`useCapabilities`) see the model become ready without polling.

## What it maps

| Runtime              | ML Kit GenAI                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `generate`           | Prompt API `GenerativeModel.generateContent`                                  |
| `stream`             | `generateContentStream` (`Flow`) → token deltas                               |
| `signal` (abort)     | cancels the streaming coroutine (`cancelStreaming`)                           |
| `usage`              | not reported by the Prompt API → `source: 'unavailable'`                      |
| capability detection | `checkStatus()` → `FeatureStatus`                                             |
| model download       | `download()` (`downloadGeminiNanoModel`)                                      |
| sessions             | emulated (transcript replayed as prompt prefix — the Prompt API is stateless) |
| errors               | `GenAiException.errorCode` → `ExpoAIError`                                    |

Structured output and summarize/rewrite/proofread are provided by the core runtime over
`generate` (JSON prompt + validate + repair).

:::note
The `com.google.mlkit:genai-prompt` API is beta; bump the dependency version and confirm
symbol names against the installed SDK when building.
:::
