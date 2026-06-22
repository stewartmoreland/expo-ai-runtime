# @stewmore/expo-ai-apple-foundation-models

Apple **Foundation Models** (on-device, iOS 26+) provider for the
[Expo AI Runtime](../../README.md).

## Install & use

```ts
import { ExpoAI } from '@stewmore/expo-ai-core';
import '@stewmore/expo-ai-apple-foundation-models'; // registers the iOS adapter (side-effect import)

const caps = await ExpoAI.getCapabilities();
if (caps.available && caps.provider === 'apple-foundation-models') {
  const result = await ExpoAI.generate({ prompt: 'Write a haiku about Swift.' });
  console.log(result.text); // privacy: on-device
}
```

## Config plugin

The native module autolinks on its own, but add the config plugin so
`expo prebuild` also sets the iOS deployment target the pod needs — no manual
`expo-build-properties` editing:

```json
{
  "expo": {
    "plugins": ["@stewmore/expo-ai-apple-foundation-models"]
  }
}
```

Override the floor (defaults to `15.1`, the pod minimum) if needed:

```json
{
  "expo": {
    "plugins": [["@stewmore/expo-ai-apple-foundation-models", { "iosDeploymentTarget": "16.4" }]]
  }
}
```

## Requirements

- **iOS / iPadOS 26+** on an Apple Intelligence–capable device with Apple Intelligence enabled.
- A **development build** (custom native code — not Expo Go): `npx expo prebuild && npx expo run:ios`.

On unsupported OS/devices the adapter reports `available: false` with a reason
(`unsupported_os_version`, `unsupported_device`, `apple_intelligence_disabled`,
`model_initializing`), so the runtime can fall back per the app's policy.

## What it maps

| Runtime              | Foundation Models                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `generate`           | `LanguageModelSession.respond(to:options:)`                                                      |
| `stream`             | `LanguageModelSession.streamResponse(...)` (cumulative snapshots → token deltas)                 |
| `createSession`      | native stateful `LanguageModelSession` (`generateInSession` / `resetSession` / `disposeSession`) |
| capability detection | `SystemLanguageModel.availability`                                                               |
| errors               | `LanguageModelSession.GenerationError` → `ExpoAIError`                                           |

Structured output (`generateObject`), summarize/rewrite/proofread are provided
by the core runtime over `generate`. Native **guided generation** via
`DynamicGenerationSchema` is a planned enhancement (see `ios/` source notes).

> The FoundationModels API surface follows the WWDC25 docs; verify exact symbol
> names against your installed Xcode SDK if the native build flags a mismatch.
