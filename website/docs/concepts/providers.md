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
  'android-aicore-gemini-nano',
  'litert-lm',
  'apple-private-cloud-compute', // off-device
];
```

`cloud` is not in the list: registered providers that aren't listed (such as `cloud`)
are appended in registration order.

| Category      | Provider                     | Purpose                                  |
| ------------- | ---------------------------- | ---------------------------------------- |
| System model  | Apple Foundation Models      | Preferred iOS native model path          |
| System model  | Android AICore / Gemini Nano | Preferred Android native model path      |
| Private cloud | Apple Private Cloud Compute  | Apple-managed larger model path          |
| Local BYOM    | LiteRT-LM                    | Downloaded or bundled local models       |
| Cloud         | Private backend              | Reliable fallback and advanced reasoning |

## Routing rules

1. The app's [privacy policy](./privacy.md#app-wide-privacy-policy) is a hard ceiling,
   even over an explicitly requested `provider`.
2. An explicit `provider` is tried first. Other providers follow only when `fallback`
   is not `'none'`.
3. With no explicit provider, on-device providers are tried in priority order.
4. **Off-device** providers (Apple Private Cloud Compute, `cloud`) are reached only when
   requested explicitly or when `fallback` is not `'none'`. `fallback: 'cloud'` means
   "allow off-device", not "use the cloud package".
5. A **sensitive** prompt reaches a third-party cloud only when requested explicitly or
   with `fallback: 'cloud'`. Apple Private Cloud Compute stays permitted.
6. The router moves to the next candidate only when a provider is unavailable or its
   error has `fallbackRecommended`.
7. Every result carries `provider`, `privacy`, and `usage` metadata.

```ts
await ExpoAI.generate({
  prompt: 'Extract the risks from this proposal.',
  fallback: 'cloud', // "none" (default) | "cloud" | "any"
});
```

| `fallback` | On-device | Apple PCC | Third-party cloud      |
| ---------- | --------- | --------- | ---------------------- |
| `'none'`   | yes       | no        | no                     |
| `'any'`    | yes       | yes       | yes, unless sensitive  |
| `'cloud'`  | yes       | yes       | yes, even if sensitive |

See the [privacy model](./privacy.md) for how the sensitivity gate interacts with cloud
fallback, and [cloud fallback](../packages/cloud.md) for configuring the backend.

## Token usage

Every `GenerateResult` has a `usage` object. Counts are never zero-filled: a count the
provider did not report is left out, and `source` says where the counts came from.

```ts
export type ExpoAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  source: 'provider' | 'estimated' | 'unavailable'; // 'unavailable' => no counts
};
```

Apple Foundation Models reports provider usage on iOS 27+; below that, `source` is
`'unavailable'`. For object results, usage is summed across repair attempts, and is
`'unavailable'` if any attempt reported no counts.

## Prewarm

`ExpoAI.prewarm({ provider?, instructions?, promptPrefix? })` warms up the best available
provider before the first request. It never falls back off-device, never throws, and
resolves `false` when the provider is unavailable or can't prewarm. Sessions have their
own `session.prewarm()`.
