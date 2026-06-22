---
id: structured-output
title: Structured output
sidebar_position: 5
---

# Structured output

`generateObject` returns typed data validated against a JSON schema. Where a provider has
native guided generation, the runtime uses it; otherwise it prompts for JSON, validates,
and runs a repair retry.

```ts
const result = await ExpoAI.generateObject({
  prompt: 'Extract project name, budget, timeline, and risks.',
  schema: {
    type: 'object',
    properties: {
      projectName: { type: 'string' },
      budget: { type: 'string' },
      timeline: { type: 'string' },
      risks: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['projectName', 'timeline', 'risks'],
  },
  fallback: 'cloud',
});
```

## Strategy per provider

| Provider                | Strategy                                           |
| ----------------------- | -------------------------------------------------- |
| Apple Foundation Models | Native guided generation where available           |
| Android AICore          | JSON prompt + validation + repair retry            |
| LiteRT-LM               | JSON prompt + validation + repair retry            |
| Cloud                   | Provider-native JSON mode or tools where available |

The validation and repair loop lives in `expo-ai-core`, so structured output behaves
consistently regardless of which provider answered.

## streamObject

`streamObject` streams a structured object as it is generated: subscribe to
`partialObjectStream` for progressively-complete snapshots as tokens arrive, and/or
await `object` for the validated (repaired) final value. All four views are backed by
one generation; on failure the streams throw and the promises reject with the same
`ExpoAIError`.

```ts
const { partialObjectStream, object, result } = ExpoAI.streamObject({
  prompt: 'Extract project name, budget, timeline, and risks.',
  schema: {
    type: 'object',
    properties: {
      projectName: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
    },
    required: ['projectName', 'risks'],
  },
  fallback: 'cloud',
});

// Render the object filling in, field by field, as tokens arrive.
for await (const partial of partialObjectStream) {
  render(partial); // DeepPartial<T> — the last snapshot equals `object`
}

const final = await object; // validated, schema-conforming
console.log((await result).provider);
```

The streamed text seeds the validate→repair loop, so a second generation only happens
if the streamed JSON doesn't validate. Partial snapshots are best-effort and may briefly
omit the field currently streaming — the final `object` is always validated.

In React, [`useObject`](../packages/react.md#useobject) wraps this into component state.
