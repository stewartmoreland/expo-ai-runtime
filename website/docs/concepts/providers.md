---
id: providers
title: Providers & routing
sidebar_position: 2
---

# Providers & routing

A **provider** is a single engine the runtime can call. The router picks the best
available one and, when allowed, falls back through the rest.

```ts
export type ExpoAIProvider =
  | 'system-preferred'
  | 'apple-foundation-models'
  | 'apple-private-cloud-compute'
  | 'android-aicore-gemini-nano'
  | 'litert-lm'
  | 'cloud'
  | 'none';
```

## Default priority

```ts
export const defaultProviderPriority: ExpoAIProvider[] = [
  'apple-foundation-models',
  'apple-private-cloud-compute',
  'android-aicore-gemini-nano',
  'litert-lm',
  'cloud',
];
```

| Category      | Provider                     | Purpose                                  |
| ------------- | ---------------------------- | ---------------------------------------- |
| System model  | Apple Foundation Models      | Preferred iOS native model path          |
| System model  | Android AICore / Gemini Nano | Preferred Android native model path      |
| Private cloud | Apple Private Cloud Compute  | Apple-managed larger model path          |
| Local BYOM    | LiteRT-LM                    | Downloaded or bundled local models       |
| Cloud         | Private backend              | Reliable fallback and advanced reasoning |

## Routing rules

1. Try the requested provider.
2. If it's unavailable and fallback is allowed, try the next provider in priority order.
3. If the prompt is **sensitive** and cloud fallback is disabled, fail locally rather
   than send it off-device.
4. Return provider metadata with every result.

```ts
await ExpoAI.generate({
  prompt: 'Extract the risks from this proposal.',
  fallback: 'cloud', // "none" | "cloud" | "any"
});
```

See the [privacy model](./privacy.md) for how the sensitivity gate interacts with cloud
fallback, and [cloud fallback](../packages/cloud.md) for configuring the backend.
