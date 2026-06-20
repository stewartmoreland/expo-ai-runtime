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
  fallback?: "none" | "cloud" | "any";
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
};

export type ExpoAISession = {
  id: string;
  provider: ExpoAIProvider;

  generate(options: SessionGenerateOptions): Promise<GenerateResult>;
  stream(options: SessionGenerateOptions): AsyncIterable<GenerateChunk>;
  generateObject<T>(options: SessionGenerateObjectOptions): Promise<T>;

  reset(): Promise<void>;
  dispose(): Promise<void>;
};
```

```ts
const session = await ExpoAI.createSession({
  instructions: "You are a concise note-taking assistant.",
});
await session.generate({ prompt: "Capture the action items from this meeting." });
await session.dispose();
```

## Native mapping

| Concept | iOS | Android | Cloud |
| --- | --- | --- | --- |
| Session | Native Foundation Models session | Native or emulated session | Conversation / thread |
| Instructions | Native instructions | Prompt prefix | System message |
| Streaming | Native if available | Native or emulated | Provider stream |
| Structured output | Native if available | JSON prompt + validation | JSON mode / tools |
| Tools | Native if available | Emulated | Provider tools |
