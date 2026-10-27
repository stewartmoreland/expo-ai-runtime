---
id: apple-foundation-models
title: Apple Foundation Models
sidebar_position: 2
---

# @stewmore/expo-ai-apple-foundation-models

Apple **Foundation Models** provider for the Expo AI Runtime: the on-device model
(iOS 26+) and, opt-in, Apple **Private Cloud Compute** (iOS 27+).

## Install & use

```ts
import { ExpoAI } from '@stewmore/expo-ai-core';
import '@stewmore/expo-ai-apple-foundation-models'; // registers the iOS adapters (side-effect import)

const caps = await ExpoAI.getCapabilities();
if (caps.available && caps.provider === 'apple-foundation-models') {
  const result = await ExpoAI.generate({ prompt: 'Write a haiku about Swift.' });
  console.log(result.text); // privacy: on-device
}
```

## Requirements

- **iOS / iPadOS 26+** on an Apple Intelligence–capable device with Apple Intelligence
  enabled.
- A **development build** (custom native code — not Expo Go):
  `npx expo prebuild && npx expo run:ios`.

On unsupported OS/devices the adapter reports `available: false` with a reason
(`unsupported_os_version`, `unsupported_device`, `apple_intelligence_disabled`,
`model_initializing`, `unsupported_locale`), so the runtime can fall back per the app's
policy. Availability also reports `supportedLanguages` and the model's real
`contextWindow`, and is re-checked when the app returns to the foreground.

## What it maps

| Runtime              | Foundation Models                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `generate`           | `LanguageModelSession.respond(to:options:)`                                                      |
| `stream`             | `LanguageModelSession.streamResponse(...)` (cumulative snapshots → token deltas)                 |
| `generateObject`     | guided generation: `respond(to:schema:)` with a `DynamicGenerationSchema`                        |
| `createSession`      | native stateful `LanguageModelSession` (`generateInSession` / `resetSession` / `disposeSession`) |
| `signal` (abort)     | cancels the native task                                                                          |
| `prewarm`            | `LanguageModelSession.prewarm(promptPrefix:)`                                                    |
| capability detection | `SystemLanguageModel.availability`, `supportedLanguages`, `contextSize`                          |
| `usage`              | provider token counts on iOS 27+; `source: 'unavailable'` below                                  |
| errors               | `GenerationError` / `LanguageModelError` → `ExpoAIError`                                         |

Guided generation supports a subset of JSON Schema; see
[structured output](../concepts/structured-output.md#apple-guided-generation-schema-subset).
With the default `structuredOutput: 'auto'`, an unsupported schema falls back to the JSON
prompt. Summarize, rewrite, and proofread are provided by the core runtime over
`generate`.

## Token counting

```ts
import { countTokens } from '@stewmore/expo-ai-apple-foundation-models';

const tokens = await countTokens(longText); // number, or null below iOS 26.4
```

## Private Cloud Compute

Apple Private Cloud Compute (PCC) runs a larger Apple model off-device. It registers as
the `apple-private-cloud-compute` provider and is **opt-in**:

```json title="app.json"
{
  "expo": {
    "plugins": [["@stewmore/expo-ai-apple-foundation-models", { "privateCloudCompute": true }]]
  }
}
```

The plugin adds the PCC entitlement and an `ExpoAIPrivateCloudCompute` Info.plist marker.
Without the option, PCC reports `entitlement_missing`.

:::caution[Unverified entitlement]
The entitlement key (`com.apple.developer.private-cloud-compute`) has not yet been
confirmed on a device. Check it against Apple's current documentation before you ship.
:::

PCC requires **iOS 27+**. It is off-device, so the router uses it only when requested
explicitly or when `fallback` is not `'none'`:

```ts
const result = await ExpoAI.generate({
  provider: 'apple-private-cloud-compute',
  prompt: 'Draft a detailed project plan.',
  reasoningLevel: 'deep', // 'light' | 'moderate' | 'deep'; PCC only
});
result.privacy.privacyMode; // 'apple-private-cloud-compute'
```

PCC has a usage quota. When it runs out, availability reports `quota_exhausted` and
requests fail with `QUOTA_EXHAUSTED`.

```ts
import { getPCCQuota, showPCCLimitIncrease } from '@stewmore/expo-ai-apple-foundation-models';

const quota = await getPCCQuota();
// { status: 'below_limit' | 'limit_reached', isApproachingLimit, resetDate (ms) | null,
//   canRequestLimitIncrease } — or null when PCC isn't configured or supported
if (quota?.status === 'limit_reached' && quota.canRequestLimitIncrease) {
  await showPCCLimitIncrease(); // presents Apple's limit-increase sheet
}
```

PCC-specific errors: `QUOTA_EXHAUSTED`, `NETWORK_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, and
`ENTITLEMENT_MISSING`. None of them recommend fallback.
