---
id: privacy
title: Privacy model
sidebar_position: 6
---

# Privacy model

Every result identifies where processing happened. This is core to the runtime — the app
should never have to guess whether a prompt left the device.

```ts
export type ExpoAIPrivacyInfo = {
  provider: ExpoAIProvider;
  isOnDevice: boolean;
  sendsPromptOffDevice: boolean;
  privacyMode: 'on-device' | 'apple-private-cloud-compute' | 'third-party-cloud' | 'unknown';
};
```

## Recommended UI copy

| Mode                        | Copy                                            |
| --------------------------- | ----------------------------------------------- |
| On-device                   | Processed privately on this device.             |
| Apple Private Cloud Compute | Processed using Apple Private Cloud Compute.    |
| Third-party cloud           | Processed using a configured cloud AI provider. |

:::warning[Sensitive prompts]
Do not silently fall back to a third-party cloud for sensitive workflows unless the app
has disclosed and enabled that behavior. Mark a request `sensitive` and the router won't
send it to a third-party cloud unless you set `fallback: 'cloud'` or name `cloud` as the
provider. Apple Private Cloud Compute stays permitted for sensitive prompts, but like any
off-device provider it still needs `fallback` other than `'none'`.
:::

The example apps render these modes as badges (green = on-device, purple = Apple Private
Cloud Compute, amber = third-party cloud) — the same visual language this site uses.

## App-wide privacy policy

`ExpoAI.setPrivacyPolicy` sets a ceiling the router never routes outside, even for an
explicitly requested provider. The default allows every provider and mode.

```ts
ExpoAI.setPrivacyPolicy({
  allowedModes: ['on-device', 'apple-private-cloud-compute'],
  allowedProviders: ['apple-foundation-models', 'apple-private-cloud-compute'],
  sensitiveByDefault: true, // every request is sensitive; a request can't opt out
  lock: true, // any later setPrivacyPolicy call throws
});
```

- A provider must be in `allowedProviders` **and** its privacy mode in `allowedModes`.
- `sensitiveByDefault` is OR-ed with each request's `sensitive`.
- `sensitive` blocks only silent routing. An explicit `provider: 'cloud'` with
  `sensitive: true` is still allowed. To forbid a provider outright, leave it (or its
  mode) out of the policy.
- `getAvailability()` and `getCapabilities()` only consider allowed providers;
  `listProviders()` lists every registered one.
- Sessions honour `sensitive` when they pick a provider, and a session whose provider a
  later policy disallows throws `UNAVAILABLE` on its next call.
- `ExpoAI.getPrivacyPolicy()` returns the current policy, and `isProviderAllowed(provider)`
  checks one provider against it.
