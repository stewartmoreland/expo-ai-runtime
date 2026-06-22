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
import { ExpoAI } from '@stewmore/expo-ai-core';
import '@stewmore/expo-ai-apple-foundation-models'; // registers the iOS adapter
import '@stewmore/expo-ai-android-aicore'; // registers the Android adapter

const caps = await ExpoAI.getCapabilities();
if (caps.available) {
  const result = await ExpoAI.generate({
    prompt: 'Summarize this note in five bullets.',
    fallback: 'cloud',
  });
  console.log(result.text, result.provider, result.privacy.privacyMode);
}
```

Every result carries **`provider`** and **`privacy`** metadata, so the app always knows
which engine answered and whether the prompt left the device. See the
[privacy model](../concepts/privacy.md) for what the modes mean.

There's no setup step beyond importing a provider package — adapters self-register on
import. If none is registered, `ExpoAI.generate()` throws a clear `UNAVAILABLE` error
telling you which package to install.

## Wire the native modules (`expo prebuild`)

Custom native code means a [development build](../packages/apple-foundation-models.md),
not Expo Go. Add the provider config plugins so `expo prebuild` sets the iOS deployment
target and Android `minSdkVersion` for you — no manual `expo-build-properties`:

```json title="app.json"
{
  "expo": {
    "plugins": ["@stewmore/expo-ai-apple-foundation-models", "@stewmore/expo-ai-android-aicore"]
  }
}
```

```bash
npx expo prebuild
npx expo run:ios   # or run:android
```

## React hooks

With [`@stewmore/expo-ai-react`](../packages/react.md), the same runtime is a few hooks —
streaming, cancellation, and unmount cleanup are handled for you:

```tsx
import { useChat } from '@stewmore/expo-ai-react';

function Chat() {
  const { messages, input, setInput, append, isLoading } = useChat({ fallback: 'cloud' });
  return (
    <>
      {messages.map((m) => (
        <Text key={m.id}>
          {m.role}: {m.content}
        </Text>
      ))}
      <TextInput value={input} onChangeText={setInput} />
      <Button title="Send" onPress={() => append()} disabled={isLoading} />
    </>
  );
}
```

## Where to go next

- [React hooks](../packages/react.md) — `useChat`, `useObject`, `useGenerate`,
  `useCapabilities`.
- [Recipes](../recipes/streaming-chat.md) — copy-paste patterns: streaming chat,
  structured streaming, capability-gated UI, cloud fallback.
- [Capability detection](../concepts/capabilities.mdx) — gate features on what the device
  can actually do.
- [Structured output](../concepts/structured-output.md) — `generateObject` /
  `streamObject` with a JSON schema and a repair loop.
- [Providers & routing](../concepts/providers.md) — the default priority order and
  fallback rules.
