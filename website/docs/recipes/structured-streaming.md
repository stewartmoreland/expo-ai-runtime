---
id: structured-streaming
title: Structured streaming
sidebar_position: 2
---

# Structured streaming

Render a typed object as it fills in, field by field, with
[`useObject`](../packages/react.md#useobject) over
[`streamObject`](../concepts/structured-output.md#streamobject). `object` is a partial
snapshot while streaming and the validated value once complete.

```tsx
import { useObject } from '@stewmore/expo-ai-react';
import { Button, Text, View } from 'react-native';

const recipeSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'ingredients', 'steps'],
} as const;

type Recipe = { title: string; ingredients: string[]; steps: string[] };

export function RecipeCard() {
  const { submit, object, isLoading, error } = useObject<Recipe>();

  return (
    <View style={{ gap: 8 }}>
      <Button
        title="Generate recipe"
        onPress={() =>
          submit({ prompt: 'A simple weeknight pasta.', schema: recipeSchema, fallback: 'cloud' })
        }
        disabled={isLoading}
      />

      {object?.title ? <Text style={{ fontWeight: '600' }}>{object.title}</Text> : null}
      {object?.ingredients?.map((item, i) => (
        <Text key={i}>• {item}</Text>
      ))}
      {object?.steps?.map((step, i) => (
        <Text key={i}>
          {i + 1}. {step}
        </Text>
      ))}

      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
    </View>
  );
}
```

Snapshots grow monotonically — fields appear as they stream — and the final `object`
is always validated against the schema (with a repair retry if the model's first draft
doesn't conform).
