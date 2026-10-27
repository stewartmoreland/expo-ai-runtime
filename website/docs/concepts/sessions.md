---
id: sessions
title: Sessions
sidebar_position: 4
---

# Sessions

The Expo layer owns a cross-platform session abstraction. A session keeps conversational
state — natively where the provider supports it, emulated where it doesn't.

```ts
export type CreateSessionOptions = {
  instructions?: string;
  provider?: ExpoAIProvider;
  fallback?: 'none' | 'cloud' | 'any';
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  sensitive?: boolean;
  reasoningLevel?: 'light' | 'moderate' | 'deep';
};

export type ExpoAISession = {
  id: string;
  provider: ExpoAIProvider;

  generate(options: SessionGenerateOptions): Promise<GenerateResult>;
  stream(options: SessionGenerateOptions): AsyncIterable<GenerateChunk>;
  generateObject<T>(options: SessionGenerateObjectOptions): Promise<T>;
  generateObjectWithMeta<T>(
    options: SessionGenerateObjectOptions,
  ): Promise<{ object: T; result: GenerateResult }>;
  prewarm(options?: { promptPrefix?: string }): Promise<boolean>;

  reset(): Promise<void>;
  dispose(): Promise<void>;
};
```

- **`sensitive`** applies the same [routing gate](./providers.md#routing-rules) as a
  one-shot request when the session picks its provider: a sensitive session binds to a
  third-party cloud only with `fallback: 'cloud'` or an explicit `provider: 'cloud'`.
- The session is bound to one provider. If a later
  [privacy policy](./privacy.md#app-wide-privacy-policy) disallows it, the session's next
  call throws `UNAVAILABLE`.
- **`generateObjectWithMeta`** returns the object plus its `GenerateResult` (`usage`,
  `structured`). Schema and repair prompts never pollute the transcript.
- **`prewarm`** is best-effort and resolves `false` when the provider can't prewarm.
- **`reasoningLevel`** is a hint used by Apple Private Cloud Compute and ignored elsewhere.

```ts
const session = await ExpoAI.createSession({
  instructions: 'You are a concise note-taking assistant.',
});
await session.generate({ prompt: 'Capture the action items from this meeting.' });
await session.dispose();
```

## Native mapping

| Concept           | iOS                              | Android                    | Cloud                 |
| ----------------- | -------------------------------- | -------------------------- | --------------------- |
| Session           | Native Foundation Models session | Native or emulated session | Conversation / thread |
| Instructions      | Native instructions              | Prompt prefix              | System message        |
| Streaming         | Native if available              | Native or emulated         | Provider stream       |
| Structured output | Native if available              | JSON prompt + validation   | JSON mode / tools     |
| Tools             | Native if available              | Emulated                   | Provider tools        |
