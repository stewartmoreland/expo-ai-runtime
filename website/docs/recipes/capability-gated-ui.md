---
id: capability-gated-ui
title: Capability-gated UI
sidebar_position: 3
---

# Capability-gated UI

Show a feature only when the device can actually run it, and guide the user when it
can't — using [`useCapabilities`](../packages/react.md#usecapabilities). This is the
difference between a polished first run and a dead button.

```tsx
import { useCapabilities } from '@stewmore/expo-ai-react';
import { Button, Text, View } from 'react-native';

export function AIFeature() {
  const { capabilities, availability, loading, refresh } = useCapabilities();

  if (loading) return <Text>Checking device…</Text>;

  if (!capabilities?.available) {
    // Guide the user based on *why* it's unavailable.
    const reason = availability?.reasonUnavailable;
    return (
      <View style={{ gap: 8 }}>
        <Text>On-device AI isn't ready{reason ? ` (${reason})` : ''}.</Text>
        {reason === 'model_not_downloaded' ? <Text>The model is still downloading.</Text> : null}
        {reason === 'apple_intelligence_disabled' ? (
          <Text>Enable Apple Intelligence in Settings.</Text>
        ) : null}
        <Button title="Check again" onPress={refresh} />
      </View>
    );
  }

  if (!capabilities.supportsStructuredOutput) {
    return <Text>This device can generate text but not structured output.</Text>;
  }

  return <RecipeCard />; // safe to show the full feature
}
```

Call `refresh()` after the user changes a setting or a model finishes downloading.
Use [`getCapabilities()`](../concepts/capabilities.mdx) for the active provider, or
`listProviders()` to inspect every registered one.
