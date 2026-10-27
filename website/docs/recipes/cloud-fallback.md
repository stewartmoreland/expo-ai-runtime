---
id: cloud-fallback
title: Cloud fallback & privacy
sidebar_position: 4
---

# Cloud fallback & privacy

On-device first, cloud only when you opt in — and never silently for a sensitive
prompt. Every result tells you which engine answered and whether the prompt left the
device, so you can surface that to the user.

```tsx
import { ExpoAI } from '@stewmore/expo-ai-core';
import { useGenerate } from '@stewmore/expo-ai-react';

function Summarize({ note, sensitive }: { note: string; sensitive: boolean }) {
  const { generate, result } = useGenerate();

  async function run() {
    await generate({
      prompt: `Summarize:\n\n${note}`,
      // Opt in to off-device fallback when on-device is unavailable…
      fallback: 'any',
      // …but keep sensitive prompts away from a third-party cloud.
      // (fallback: 'cloud' would let them through.)
      sensitive,
    });
  }

  return (
    <>
      <Button title="Summarize" onPress={run} />
      {result ? (
        <Text>
          {result.text}
          {'\n\n'}
          via {result.provider} · {result.privacy.privacyMode}
          {result.privacy.sendsPromptOffDevice ? ' (left device)' : ' (stayed on device)'}
        </Text>
      ) : null}
    </>
  );
}
```

## The rules

- **`fallback`** is `'none'` by default, which keeps every request on-device. Set
  `'cloud'` or `'any'` to allow off-device providers (Apple Private Cloud Compute and
  `cloud`).
- A prompt marked **`sensitive: true`** reaches a third-party cloud only with
  `fallback: 'cloud'` (or an explicit `provider: 'cloud'`). With `fallback: 'any'`, the
  router fails instead of sending it there.
- Apple **Private Cloud Compute** is not gated by `sensitive`, but it is off-device, so
  it still needs `fallback` other than `'none'` unless requested explicitly.
- For a hard block that no request can override, use
  [`ExpoAI.setPrivacyPolicy`](../concepts/privacy.md#app-wide-privacy-policy).

See the [privacy model](../concepts/privacy.md) and
[providers & routing](../concepts/providers.md) for the full policy.
