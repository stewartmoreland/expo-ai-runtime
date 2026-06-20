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
  privacyMode:
    | "on-device"
    | "apple-private-cloud-compute"
    | "third-party-cloud"
    | "unknown";
};
```

## Recommended UI copy

| Mode | Copy |
| --- | --- |
| On-device | Processed privately on this device. |
| Apple Private Cloud Compute | Processed using Apple Private Cloud Compute. |
| Third-party cloud | Processed using a configured cloud AI provider. |

:::warning[Sensitive prompts]
Do not silently fall back to a third-party cloud for sensitive workflows unless the app
has disclosed and enabled that behavior. Mark a request `sensitive` and the router will
fail locally rather than route it off-device when cloud fallback is disabled.
:::

The example apps render these modes as badges (green = on-device, purple = Apple Private
Cloud Compute, amber = third-party cloud) — the same visual language this site uses.
