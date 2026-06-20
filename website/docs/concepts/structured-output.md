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
  prompt: "Extract project name, budget, timeline, and risks.",
  schema: {
    type: "object",
    properties: {
      projectName: { type: "string" },
      budget: { type: "string" },
      timeline: { type: "string" },
      risks: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["projectName", "timeline", "risks"],
  },
  fallback: "cloud",
});
```

## Strategy per provider

| Provider | Strategy |
| --- | --- |
| Apple Foundation Models | Native guided generation where available |
| Android AICore | JSON prompt + validation + repair retry |
| LiteRT-LM | JSON prompt + validation + repair retry |
| Cloud | Provider-native JSON mode or tools where available |

The validation and repair loop lives in `expo-ai-core`, so structured output behaves
consistently regardless of which provider answered.
