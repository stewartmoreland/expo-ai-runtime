# @stewmore/expo-ai-apple-foundation-models

Apple **Foundation Models** provider for the [Expo AI Runtime](../../README.md): the
on-device model (iOS 26+) and, opt-in, Apple **Private Cloud Compute** (iOS 27+).

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

Options:

```json
{
  "expo": {
    "plugins": [
      [
        "@stewmore/expo-ai-apple-foundation-models",
        { "iosDeploymentTarget": "16.4", "privateCloudCompute": true }
      ]
    ]
  }
}
```

- `iosDeploymentTarget` — defaults to `15.1`, the pod minimum.
- `privateCloudCompute` — opt in to Private Cloud Compute (see below).

## Requirements

- **iOS / iPadOS 26+** on an Apple Intelligence–capable device with Apple Intelligence enabled.
- A **development build** (custom native code — not Expo Go): `npx expo prebuild && npx expo run:ios`.

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

Guided generation supports a JSON Schema subset: an object root; `string` (optionally
with a string `enum`), `integer` / `number` (`minimum` / `maximum`), `boolean`, `array`
(`items`, `minItems`, `maxItems`), nested objects, `required`, and `description`. Other
keywords fail with `UNSUPPORTED_SCHEMA`, and with the default
`structuredOutput: 'auto'` the runtime falls back to the JSON prompt. Summarize, rewrite,
and proofread are provided by the core runtime over `generate`.

`countTokens(text)` returns the on-device token count, or `null` below iOS 26.4.

## Private Cloud Compute

Set `privateCloudCompute: true` in the plugin options to register the
`apple-private-cloud-compute` provider (**iOS 27+**). The plugin adds the PCC
entitlement and an `ExpoAIPrivateCloudCompute` Info.plist marker; without it, PCC reports
`entitlement_missing`.

> **Unverified:** the entitlement key (`com.apple.developer.private-cloud-compute`) has
> not yet been confirmed on a device. Check it against Apple's documentation before you
> ship.

PCC is off-device, so the router uses it only when requested explicitly or when
`fallback` is not `'none'`. It is permitted for `sensitive` prompts.

```ts
import { getPCCQuota, showPCCLimitIncrease } from '@stewmore/expo-ai-apple-foundation-models';

const result = await ExpoAI.generate({
  provider: 'apple-private-cloud-compute',
  prompt: 'Draft a detailed project plan.',
  reasoningLevel: 'deep', // 'light' | 'moderate' | 'deep'; PCC only
});

const quota = await getPCCQuota(); // null when PCC isn't configured or supported
if (quota?.status === 'limit_reached' && quota.canRequestLimitIncrease) {
  await showPCCLimitIncrease(); // presents Apple's limit-increase sheet
}
```

PCC-specific errors: `QUOTA_EXHAUSTED`, `NETWORK_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, and
`ENTITLEMENT_MISSING`.
