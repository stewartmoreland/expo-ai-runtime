---
id: quick-start
title: Quick start
sidebar_position: 2
---

# Quick start

Check capabilities at runtime, then generate. The same call works across Apple
Foundation Models, Android Gemini Nano, and your cloud backend — routing and fallback
are handled for you.

```ts
import { ExpoAI } from "@stewmore/expo-ai-core";
import "@stewmore/expo-ai-apple-foundation-models"; // registers the iOS adapter
import "@stewmore/expo-ai-android-aicore";          // registers the Android adapter

const caps = await ExpoAI.getCapabilities();
if (caps.available) {
  const result = await ExpoAI.generate({
    prompt: "Summarize this note in five bullets.",
    fallback: "cloud",
  });
  console.log(result.text, result.provider, result.privacy.privacyMode);
}
```

Every result carries **`provider`** and **`privacy`** metadata, so the app always knows
which engine answered and whether the prompt left the device. See the
[privacy model](../concepts/privacy.md) for what the modes mean.

## Where to go next

- [Capability detection](../concepts/capabilities.md) — gate features on what the device
  can actually do.
- [Structured output](../concepts/structured-output.md) — `generateObject` with a JSON
  schema and a repair loop.
- [Providers & routing](../concepts/providers.md) — the default priority order and
  fallback rules.
