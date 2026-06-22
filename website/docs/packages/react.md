---
id: react
title: expo-ai-react
sidebar_position: 2
---

# @stewmore/expo-ai-react

React hooks for the runtime — `ai/react`-style ergonomics over the pure-TS core.
Use them for streaming chat, partial-object streaming, and capability-gated UI
without writing your own `AbortController`/`isMounted` plumbing.

```bash
npm install @stewmore/expo-ai-react
```

The package peer-depends on `react` only (no React Native import), so the hooks
work in any React renderer. Each hook owns an `AbortController`: `stop()` and
unmount both cancel cleanly, and a cancellation is never surfaced as an `error`.

## useGenerate

One-shot or token-streamed text generation.

```tsx
import { useGenerate } from '@stewmore/expo-ai-react';

function Composer() {
  const { stream, text, isLoading, error, stop } = useGenerate();

  return (
    <>
      <Button
        title="Write"
        onPress={() => stream({ prompt: 'Write a haiku about the sea.', fallback: 'cloud' })}
      />
      {isLoading ? <Button title="Stop" onPress={stop} /> : null}
      <Text>{text}</Text>
      {error ? <Text>{error.message}</Text> : null}
    </>
  );
}
```

`{ generate, stream, text, result, isLoading, error, stop, reset }` — `generate`
is one-shot; `stream` accumulates `text` as tokens arrive. Both resolve the final
`GenerateResult` (with `provider` + `privacy`).

## useChat

A streaming chat transcript over a cross-platform [session](../concepts/sessions.md).

```tsx
import { useChat } from '@stewmore/expo-ai-react';

function Chat() {
  const { messages, input, setInput, append, isLoading, stop } = useChat({ fallback: 'cloud' });

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

`{ messages, input, setInput, append, isLoading, error, stop, reset }`. The
session is created lazily on the first `append` and disposed on unmount;
`append(content?)` defaults to the current `input`.

## useObject

Partial-object streaming via [`streamObject`](../concepts/structured-output.md#streamobject)
— `object` fills in as tokens arrive, then becomes the validated final value.

```tsx
import { useObject } from '@stewmore/expo-ai-react';

const recipeSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'steps'],
} as const;

function Recipe() {
  const { submit, object, isLoading } = useObject<{ title: string; steps: string[] }>();

  return (
    <>
      <Button
        title="Generate"
        onPress={() => submit({ prompt: 'A pasta recipe.', schema: recipeSchema })}
      />
      <Text>{object?.title}</Text>
      {object?.steps?.map((s, i) => (
        <Text key={i}>{s}</Text>
      ))}
    </>
  );
}
```

`{ submit, object, isLoading, error, stop, reset }`. `object` is a `DeepPartial<T>`
while streaming and the validated `T` once complete.

## useCapabilities

What the runtime can do on this device — resolved on mount, re-queryable.

```tsx
import { useCapabilities } from '@stewmore/expo-ai-react';

function Gate() {
  const { capabilities, loading, refresh } = useCapabilities();
  if (loading) return <Spinner />;
  if (!capabilities?.supportsStreaming) return <Text>Streaming unavailable on this device.</Text>;
  return <Composer />;
}
```

`{ capabilities, availability, providers, loading, error, refresh }`. Call
`refresh()` after the user enables Apple Intelligence or finishes a model
download. See [capability detection](../concepts/capabilities.mdx).
