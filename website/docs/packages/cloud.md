---
id: cloud
title: Cloud fallback
sidebar_position: 4
---

# @stewmore/expo-ai-cloud

The cloud fallback client adapter (pure TypeScript). It POSTs to a configurable backend
and streams via `expo/fetch`, giving the router a reliable path when no on-device
provider is available — and an explicit one for prompts that aren't marked sensitive.

```bash
npm install @stewmore/expo-ai-cloud
```

## Configure the endpoint

```ts
import { configureCloud } from '@stewmore/expo-ai-cloud';
import { fetch as expoFetch } from 'expo/fetch';

configureCloud({ endpoint: 'http://localhost:8787', fetch: expoFetch });
```

```ts
export type CloudProviderConfig = {
  endpoint: string;
  headers?: Record<string, string>;
  provider?: 'openai' | 'gemini' | 'anthropic' | 'bedrock' | 'custom';
};
```

## Fallback behavior

```ts
await ExpoAI.generate({
  prompt: 'Extract the risks from this proposal.',
  fallback: 'cloud',
});
```

The router only reaches the cloud when fallback is allowed and the prompt isn't gated by
the [privacy model](../concepts/privacy.md). Every result still carries `provider` and
`privacy` metadata — cloud responses report `third-party-cloud`.

The repo ships a [reference cloud server](../examples/reference-server.md) that
implements this wire protocol and runs in mock mode by default, so the cloud examples
work offline.
