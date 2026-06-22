---
id: streaming-chat
title: Streaming chat
sidebar_position: 1
---

# Streaming chat

A full chat screen with live tokens, a stop button, and on-device-first routing —
using [`useChat`](../packages/react.md#usechat). The session is created lazily and
disposed on unmount; you only manage `messages` and `input`.

```tsx
import { useChat } from '@stewmore/expo-ai-react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';

export function Chat() {
  const { messages, input, setInput, append, isLoading, stop, error } = useChat({
    instructions: 'You are a concise, friendly assistant.',
    fallback: 'cloud',
  });

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <ScrollView contentContainerStyle={{ gap: 8 }}>
        {messages.map((m) => (
          <Text key={m.id} style={{ fontWeight: m.role === 'user' ? '600' : '400' }}>
            {m.content}
          </Text>
        ))}
      </ScrollView>

      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}

      <TextInput value={input} onChangeText={setInput} placeholder="Message…" />
      {isLoading ? (
        <Button title="Stop" onPress={stop} />
      ) : (
        <Button title="Send" onPress={() => append()} />
      )}
    </View>
  );
}
```

- `append()` with no argument sends the current `input` and clears it.
- Tokens stream into the latest assistant message as they arrive.
- `stop()` aborts the in-flight reply; a stop is never surfaced as `error`.
