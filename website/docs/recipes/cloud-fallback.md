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
      // Opt in to cloud fallback when on-device is unavailable…
      fallback: 'cloud',
      // …but mark sensitive prompts so they never reach a third-party cloud.
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

- **`fallback`** is `'none'` by default. Set `'cloud'` (or `'any'`) to allow off-device.
- A prompt marked **`sensitive: true`** is never sent to a third-party cloud, even with
  `fallback: 'cloud'` — the router fails locally instead.
- Apple **Private Cloud Compute** is treated as on-device-grade for privacy and is not
  gated by `sensitive`.

See the [privacy model](../concepts/privacy.md) and
[providers & routing](../concepts/providers.md) for the full policy.
