---
id: reference-server
title: Reference cloud server
sidebar_position: 2
---

# Reference cloud server

A tiny [Hono](https://hono.dev) backend implementing the wire protocol the
[`@stewmore/expo-ai-cloud`](../packages/cloud.md) adapter speaks. **Runs in mock mode by
default** (no API keys), so the `cloud-fallback` and `structured-output` examples work
offline.

## Run

```bash
npm run server                       # from the repo root
# or
npm run dev --workspace @stewmore/expo-ai-server
```

Listens on `http://localhost:8787` (override with `PORT`).

## Modes

| Env                    | Mode                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| _(none)_               | **mock** — canned replies; schema requests return a schema-shaped sample        |
| `OPENAI_API_KEY`       | proxy OpenAI-compatible `/chat/completions` (`OPENAI_BASE_URL`, `OPENAI_MODEL`) |
| `ANTHROPIC_API_KEY`    | proxy Anthropic `/v1/messages` (`ANTHROPIC_MODEL`)                              |
| `EXPO_AI_FORCE_MOCK=1` | force mock even if keys are set                                                 |

`OPENAI_BASE_URL` lets you point at any OpenAI-compatible server (OpenRouter, Ollama, LM
Studio, a local proxy, …).

## Endpoints

```
GET  /health      -> { ok: true, mode }
POST /v1/generate -> { text, finishReason, usage }
POST /v1/stream   -> SSE: data: {"type":"delta","text":"…"} … data: {"type":"done",…} … data: [DONE]
```

Request body: `{ prompt, instructions?, temperature?, maxOutputTokens?, schema?, schemaName? }`.

## Point the app at it

```ts
import { configureCloud } from '@stewmore/expo-ai-cloud';
import { fetch as expoFetch } from 'expo/fetch';

configureCloud({ endpoint: 'http://localhost:8787', fetch: expoFetch });
```

:::note
On a physical device use your machine's LAN IP instead of `localhost`.
:::
