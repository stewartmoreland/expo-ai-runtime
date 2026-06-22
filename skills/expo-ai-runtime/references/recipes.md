# expo-ai-runtime — recipes

Copy-paste patterns adapted from `examples/*`. Read the one matching your task; pair with
[`api.md`](api.md) for the exact shapes.

## Contents

- [Setup: wire providers once](#setup-wire-providers-once)
- [Capability detection](#capability-detection)
- [One-shot generate + privacy badge](#one-shot-generate--privacy-badge)
- [Streaming with cancel](#streaming-with-cancel)
- [Structured output (generateObject)](#structured-output-generateobject)
- [Streamed structured output (useObject)](#streamed-structured-output-useobject)
- [Sessions / chat](#sessions--chat)
- [Cloud fallback & sensitivity gating](#cloud-fallback--sensitivity-gating)
- [Error handling](#error-handling)

## Setup: wire providers once

Put this in your app entry (e.g. `App.tsx` / `app/_layout.tsx`) so adapters are registered before
the first call. Importing a provider on the wrong platform is a safe no-op — import both.

```ts
import { fetch as expoFetch } from 'expo/fetch';
import { configureCloud } from '@stewmore/expo-ai-cloud';
import '@stewmore/expo-ai-apple-foundation-models'; // iOS adapter
import '@stewmore/expo-ai-android-aicore';          // Android adapter

// Only if you offer a cloud fallback. Use one env-var convention (EXPO_PUBLIC_* is inlined at
// build time); the localhost default is just for the bundled reference server.
configureCloud({
  endpoint: process.env.EXPO_PUBLIC_AI_ENDPOINT ?? 'http://localhost:8787',
  fetch: expoFetch, // required for streamed bodies in React Native
});
```

Also register both native packages as config plugins in `app.json` (see SKILL.md step 6):

```json
{ "expo": { "plugins": ["@stewmore/expo-ai-apple-foundation-models", "@stewmore/expo-ai-android-aicore"] } }
```

## Capability detection

Imperative:

```ts
import { ExpoAI } from '@stewmore/expo-ai-core';

const caps = await ExpoAI.getCapabilities();
// caps.available, caps.provider, caps.isOnDevice, caps.supportsStreaming,
// caps.supportsStructuredOutput, caps.reasonUnavailable, caps.contextWindow
```

React:

```tsx
import { useCapabilities } from '@stewmore/expo-ai-react';

function CapabilityCard() {
  const { capabilities, loading, refresh } = useCapabilities();
  if (loading) return <Text>Checking device…</Text>;
  if (!capabilities?.available) {
    return <Text>On-device AI unavailable ({capabilities?.reasonUnavailable}). Tap to retry.</Text>;
  }
  return <Text>{capabilities.provider} · {capabilities.isOnDevice ? 'on-device' : 'cloud'}</Text>;
}
```

## One-shot generate + privacy badge

```tsx
import { ExpoAI, privacyCopyForProvider } from '@stewmore/expo-ai-core';

const result = await ExpoAI.generate({
  prompt: 'Summarize this note in five bullets:\n' + note,
  fallback: 'cloud', // opt into cloud; omit to stay on-device only
});

console.log(result.text);
console.log(result.provider, result.usedFallback);
// Show the user where it ran:
const disclosure = privacyCopyForProvider(result.provider); // or result.privacy.privacyMode
```

With the hook:

```tsx
import { useGenerate } from '@stewmore/expo-ai-react';

function Summarize({ note }: { note: string }) {
  const { generate, text, result, isLoading, error } = useGenerate();
  return (
    <>
      <Button title="Summarize" disabled={isLoading}
        onPress={() => generate({ prompt: `Summarize:\n${note}`, fallback: 'cloud' })} />
      {text ? <Text>{text}</Text> : null}
      {result ? <Text>via {result.provider}{result.usedFallback ? ' (fallback)' : ''}</Text> : null}
      {error ? <Text>{error.code}: {error.message}</Text> : null}
    </>
  );
}
```

## Streaming with cancel

Raw iterable (note the try/catch — the iterable throws `ExpoAIError`):

```ts
import { ExpoAI } from '@stewmore/expo-ai-core';

const controller = new AbortController();
try {
  for await (const chunk of ExpoAI.stream({ prompt, fallback: 'cloud', signal: controller.signal })) {
    if (chunk.type === 'start') setProvider(chunk.provider);
    else if (chunk.type === 'delta') setText((t) => t + chunk.text);
    else if (chunk.type === 'done') setResult(chunk.result);
  }
} catch (e) {
  // ExpoAIError; CANCELLED if the user hit stop — usually ignore that one.
}
// Cancel: controller.abort();
```

Hook (`useGenerate().stream` accumulates `text` for you and `stop()` cancels):

```tsx
const { stream, text, isLoading, stop } = useGenerate();
// onPress start: stream({ prompt, fallback: 'cloud' });  onPress stop: stop();
```

## Structured output (generateObject)

```ts
import { ExpoAI, type JSONSchema } from '@stewmore/expo-ai-core';

type Receipt = { merchant: string; total: number; items: string[] };

const schema: JSONSchema = {
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'Store or vendor name' },
    total: { type: 'number', description: 'Grand total in the receipt currency' },
    items: { type: 'array', items: { type: 'string' }, description: 'Line-item names' },
  },
  required: ['merchant', 'total', 'items'],
};

const receipt = await ExpoAI.generateObject<Receipt>({
  prompt: `Extract structured data from this receipt:\n${raw}`,
  schema,
  fallback: 'cloud',
  // maxRepairAttempts defaults to 2 — invalid output is re-prompted with the errors
});
```

Add `description`s to schema fields (they steer the model) and keep schemas small — on-device
context windows are tight (Apple FM is 4096 tokens). `generateObject` throws the same
`ExpoAIError` codes as `generate` (e.g. `MODEL_DOWNLOAD_REQUIRED`, `USER_SETTING_REQUIRED`), so
apply the same code-branching from the [error handling](#error-handling) recipe here too.

## Streamed structured output (useObject)

```tsx
import { useObject } from '@stewmore/expo-ai-react';

function Extract({ raw, schema }: { raw: string; schema: JSONSchema }) {
  const { submit, object, isLoading } = useObject<Receipt>();
  // object updates with each partial snapshot, then becomes the validated final value
  return (
    <>
      <Button title="Extract" disabled={isLoading}
        onPress={() => submit({ prompt: `Extract:\n${raw}`, schema, fallback: 'cloud' })} />
      <Text>{JSON.stringify(object, null, 2)}</Text>
    </>
  );
}
```

## Sessions / chat

Imperative session (always `dispose()` when done):

```ts
const session = await ExpoAI.createSession({ instructions: 'You are a terse assistant.' });
const a = await session.generate({ prompt: 'Name three primary colors.' });
const b = await session.generate({ prompt: 'Now sort them alphabetically.' }); // remembers context
await session.dispose();
```

React chat — `useChat` owns the session lifecycle (lazy create, dispose on unmount):

```tsx
import { useChat } from '@stewmore/expo-ai-react';

function Chat() {
  const { messages, input, setInput, append, isLoading, stop, error } = useChat({
    instructions: 'You are a helpful assistant.',
  });
  return (
    <>
      {messages.map((m) => <Text key={m.id}>{m.role}: {m.content}</Text>)}
      <TextInput value={input} onChangeText={setInput} />
      <Button title="Send" onPress={() => append()} disabled={isLoading} />
      {isLoading ? <Button title="Stop" onPress={stop} /> : null}
      {error ? <Text>{error.code}</Text> : null}
    </>
  );
}
```

## Cloud fallback & sensitivity gating

```ts
// Default fallback: 'none' — on-device only; fails if no local provider.
await ExpoAI.generate({ prompt });

// Allow cloud when no local provider is available:
await ExpoAI.generate({ prompt, fallback: 'cloud' });

// A prompt that must never leave the device: even with fallback enabled, the router
// refuses third-party cloud for this request (on-device / Apple PCC still allowed).
await ExpoAI.generate({ prompt: diaryEntry, sensitive: true, fallback: 'cloud' });
```

Surface the outcome so the user is never surprised about where their data went. Branch on the
three-value `privacyMode` — don't collapse it to on-device-vs-cloud, because Apple Private Cloud
Compute is *off-device but privacy-preserving* (and is allowed for `sensitive` prompts):

```ts
const r = await ExpoAI.generate({ prompt, fallback: 'cloud' });
switch (r.privacy.privacyMode) {
  case 'on-device': showBadge('Processed privately on this device'); break;
  case 'apple-private-cloud-compute': showBadge('Processed in Apple Private Cloud Compute'); break;
  case 'third-party-cloud': showBadge('Processed in the cloud'); break;
  default: showBadge(privacyCopyForProvider(r.provider)); // 'unknown'
}
```

## Error handling

```ts
import { ExpoAI, ExpoAIError } from '@stewmore/expo-ai-core';

async function generateWithRecovery(prompt: string) {
  try {
    return await ExpoAI.generate({ prompt }); // on-device first
  } catch (e) {
    if (!(e instanceof ExpoAIError)) throw e;
    switch (e.code) {
      case 'MODEL_DOWNLOAD_REQUIRED':
        promptUserToDownloadModel();
        throw e;
      case 'SAFETY_BLOCKED':
      case 'INVALID_PROMPT':
        throw e; // don't fall back — fails the same way elsewhere
      default:
        if (e.fallbackRecommended) return ExpoAI.generate({ prompt, fallback: 'cloud' });
        throw e;
    }
  }
}
```

Use `e.retryable` / `e.fallbackRecommended` instead of hard-coding which codes retry — the runtime
sets sensible defaults (see the table in [`api.md`](api.md)).
