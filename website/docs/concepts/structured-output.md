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

| Provider                | Strategy                                             |
| ----------------------- | ---------------------------------------------------- |
| Apple Foundation Models | Native guided generation (`DynamicGenerationSchema`) |
| Android AICore          | JSON prompt + validation + repair retry              |
| LiteRT-LM               | JSON prompt + validation + repair retry              |
| Cloud                   | Provider-native JSON mode or tools where available   |

The validation and repair loop lives in `expo-ai-core`, so structured output behaves
consistently regardless of which provider answered. Even natively guided output is
validated against the schema.

## Choosing a strategy

`structuredOutput` picks how attempt 0 is generated. Repairs always use the JSON prompt.

| Mode               | Behavior                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'auto'` (default) | Native guided generation when the provider has it. If the provider rejects the schema (`UNSUPPORTED_SCHEMA`), retry with the JSON prompt on the same provider. |
| `'native'`         | Guided generation only. A provider without it is skipped; an unsupported schema throws `UNSUPPORTED_SCHEMA`.                                                   |
| `'emulated'`       | Always the JSON prompt.                                                                                                                                        |

`streamObject` is the exception: in `'auto'` and `'emulated'` it always streams the JSON
prompt (so `structured.mode` is `'emulated'`, even on Apple). Only `'native'` uses guided
generation there, as a single shot with no partial snapshots along the way.

`ExpoAI.generateObjectWithMeta` returns `{ object, result }`. Besides `provider`,
`privacy` and `usage`, the result has `structured`:

```ts
const { object, result } = await ExpoAI.generateObjectWithMeta({ prompt, schema });
result.structured; // { mode: 'native' | 'emulated', attempts: number, usedRepair: boolean }
```

`mode` is the strategy attempt 0 actually used; `usage` is summed across attempts.

### Apple guided-generation schema subset

Apple's guided generation accepts a subset of JSON Schema. The root must be
`type: 'object'`.

| Supported                                                                             |
| ------------------------------------------------------------------------------------- |
| `object` with `properties` and `required` (properties not in `required` are optional) |
| `string`, and `string` with an `enum` of strings                                      |
| `integer` and `number`, with `minimum` / `maximum`                                    |
| `boolean`                                                                             |
| `array` with `items`, `minItems`, `maxItems`                                          |
| `description` on any node; `additionalProperties: false`                              |

These keywords are rejected with `UNSUPPORTED_SCHEMA` (its `detail` names the keyword):
`$ref`, `anyOf` / `oneOf` / `allOf`, type arrays and nullable types, non-string `enum`,
`const`, `pattern`, `format`, `minLength` / `maxLength`, `multipleOf`, exclusive bounds,
`uniqueItems`, `patternProperties`, and `additionalProperties` other than `false`. In
`'auto'` mode the runtime then falls back to the JSON prompt, so these schemas still
work; they just aren't natively guided. Other keywords not listed in either table (for
example `not`, `contains`, `minProperties`, `prefixItems`, `if` / `then`, `$defs`) are
ignored, not rejected: the schema is still natively guided without that constraint. The
core validator doesn't enforce them either.

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
if the streamed JSON doesn't validate. This is the JSON prompt path, used in the default
`'auto'` mode. `structuredOutput: 'native'` switches to guided generation, which yields
only the final object as one snapshot. Partial snapshots are best-effort and may briefly
omit the field currently streaming — the final `object` is always validated.

In React, [`useObject`](../packages/react.md#useobject) wraps this into component state.
