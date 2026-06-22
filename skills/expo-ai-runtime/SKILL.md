---
name: expo-ai-runtime
description: >-
  Use when building or modifying an Expo / React Native app that runs AI on-device or with a
  cloud fallback — Apple Foundation Models (iOS), Android Gemini Nano / AICore, or an
  app-controlled cloud backend — through the @stewmore/expo-ai-* packages (the ExpoAI API).
  Trigger this whenever the work involves ExpoAI.generate / stream / generateObject /
  streamObject / sessions, capability detection on a phone, privacy-aware routing of prompts,
  structured JSON output from a local LLM, a streaming chat screen, or the useChat / useObject /
  useGenerate / useCapabilities React hooks — even when the user just says "add on-device AI",
  "summarize this note locally", "run Gemini Nano", "use Apple Intelligence", or "fall back to
  the cloud" without naming the package. Prefer this over generic AI-SDK or fetch-an-API advice
  whenever the target is a mobile app using this runtime.
---

# Expo AI Runtime

One TypeScript API (`ExpoAI`) over the best AI a phone can offer: **Apple Foundation Models**
(on-device, iOS 26+), **Android Gemini Nano** (on-device, via ML Kit GenAI / AICore), and an
explicit, **app-controlled cloud fallback** — with runtime capability detection, normalized
errors, and privacy metadata on every result.

The core is provider-agnostic. Provider packages **register themselves at import time**, and the
router picks the best available provider for each request. Your job in a consumer app is to wire
the packages, detect what the device can do, call the right method, and respect the privacy rules.

## Packages

| Package | Role | When to install |
| --- | --- | --- |
| `@stewmore/expo-ai-core` | The `ExpoAI` API, router, types, errors. No native code. | Always |
| `@stewmore/expo-ai-apple-foundation-models` | iOS on-device adapter (self-registers on import). | iOS support |
| `@stewmore/expo-ai-android-aicore` | Android Gemini Nano adapter (self-registers on import). | Android support |
| `@stewmore/expo-ai-cloud` | Cloud fallback adapter. Registered via `configureCloud(...)`. | Cloud fallback |
| `@stewmore/expo-ai-react` | React hooks: `useGenerate`, `useObject`, `useChat`, `useCapabilities`. | React UI |

**Versions:** the `@stewmore/expo-ai-*` packages are `0.1.0`, developed against **Expo SDK 56,
React 19.2, React Native 0.85** (the versions the bundled `examples/*` apps use). Match your app's
Expo/React Native to your project; don't pin your app's iOS deployment target (see step 6).

## The workflow

Follow these steps in order. Detailed signatures live in
[`references/api.md`](references/api.md); copy-paste patterns live in
[`references/recipes.md`](references/recipes.md) — read the recipe for the method you're using.

### 1. Install and wire the providers

Install core + the platform adapters you support + cloud (if used) + react (if using hooks).
**Registration is just an import** — importing a provider package runs its `registerAdapter`
call. Do these imports **once**, early (e.g. your app entry), so the router sees the adapters
before the first call:

```ts
import '@stewmore/expo-ai-apple-foundation-models'; // registers iOS adapter (no-op off iOS)
import '@stewmore/expo-ai-android-aicore';          // registers Android adapter (no-op off Android)
```

Importing a provider on the wrong platform — or before `expo prebuild` has generated the native
module — is a **safe no-op**: it registers an always-unavailable adapter instead of throwing. So
import both unconditionally; don't guard with `Platform.OS`.

Cloud is different: it needs configuration. Call `configureCloud(...)` once to register it, and
pass `fetch` from `expo/fetch` so streamed response bodies work in React Native:

```ts
import { fetch as expoFetch } from 'expo/fetch';
import { configureCloud } from '@stewmore/expo-ai-cloud';

configureCloud({ endpoint: 'https://your-backend.example.com', fetch: expoFetch });
```

### 2. Detect before you call

The same code runs on a flagship iPhone, an unsupported Android, and a simulator. Never assume a
provider exists — ask first, then branch the UI.

```ts
const caps = await ExpoAI.getCapabilities(); // best available provider
if (!caps.available) { /* show a "no on-device AI" state, or rely on cloud fallback */ }
if (caps.supportsStreaming) { /* offer a streaming UI */ }
if (caps.supportsStructuredOutput) { /* offer structured extraction */ }
```

In React, use `useCapabilities()` — it loads on mount and exposes `refresh()` for when the user
toggles Apple Intelligence or finishes a model download. See the capability fields in
[`references/api.md`](references/api.md).

### 3. Pick the method

| Need | Method |
| --- | --- |
| One-shot text | `ExpoAI.generate` |
| Live tokens + cancel | `ExpoAI.stream` (async iterable) |
| Validated JSON object | `ExpoAI.generateObject<T>` |
| Streamed JSON (partial snapshots) | `ExpoAI.streamObject<T>` |
| Multi-turn conversation | `ExpoAI.createSession` → `session.generate` / `session.stream` |
| Summarize / rewrite / proofread | `ExpoAI.summarize` / `rewrite` / `proofread` |

Match the recipe in [`references/recipes.md`](references/recipes.md). In React, prefer the hooks
(`useGenerate`, `useObject`, `useChat`) — they own an `AbortController`, cancel on unmount, and
treat cancellation as intentional (never an `error`).

### 4. Respect routing and privacy — this is the point of the runtime

- **Cloud is opt-in.** With the default `fallback: 'none'`, a request only uses on-device
  providers and fails if none is available. To allow the cloud, pass `fallback: 'cloud'` (or
  `'any'`). Decide this per request.
- **Never leak sensitive prompts.** Set `sensitive: true` on a prompt that must not leave the
  device. The router then refuses any third-party cloud provider for that request, even if
  fallback is enabled (on-device and Apple Private Cloud Compute are still allowed).
- **Every result is self-describing.** `GenerateResult` carries `provider`, `usedFallback`, and a
  `privacy` block (`isOnDevice`, `sendsPromptOffDevice`, `privacyMode`). Surface this in the UI —
  e.g. a badge that tells the user whether their text stayed on the device. Use `PRIVACY_COPY` /
  `privacyCopyForProvider(provider)` for ready-made disclosure strings.

### 5. Handle errors with `ExpoAIError`

Every native / cloud / JS failure is normalized to `ExpoAIError` (`code`, `provider`,
`retryable`, `fallbackRecommended`). Catch it, branch on `code`, and use the routing hints rather
than hard-coding retry logic:

```ts
import { ExpoAIError } from '@stewmore/expo-ai-core';
try {
  const result = await ExpoAI.generate({ prompt, fallback: 'cloud' });
} catch (e) {
  if (e instanceof ExpoAIError) {
    if (e.code === 'MODEL_DOWNLOAD_REQUIRED') { /* prompt the user to download */ }
    else if (e.fallbackRecommended) { /* retry with fallback: 'cloud' */ }
  }
}
```

The full code table (with `retryable` / `fallbackRecommended` defaults and what each means) is in
[`references/api.md`](references/api.md). Note `SAFETY_BLOCKED` and `INVALID_PROMPT` are
intentionally **not** fallback-recommended — re-routing them to a third party would be wrong.

### 6. Remember the native build reality

These packages ship custom native code **and Expo config plugins**, so an example/consumer app
needs a **development build**, not Expo Go. Two things the plugins require:

1. **List both native packages in `app.json` `plugins`** (the plugin name equals the package
   name). The config plugins wire the native build during prebuild:

   ```json
   { "expo": { "plugins": ["@stewmore/expo-ai-apple-foundation-models", "@stewmore/expo-ai-android-aicore"] } }
   ```

2. **Do not set `ios.deploymentTarget`.** "iOS 26+" is the **runtime** requirement for Apple
   Foundation Models, not your build's deployment target. The Apple config plugin sets the
   correct floor (`15.1`) so the app still installs on older iOS and simply reports the provider
   unavailable there — which is the whole point of capability detection (step 2). Pinning the
   target to `26.0` would needlessly exclude every sub-iOS-26 device. Override the floor only via
   the plugin prop `iosDeploymentTarget` if you really must.

Then:

```bash
npx expo prebuild
npx expo run:ios       # iOS 26 device with Apple Intelligence enabled for on-device; else cloud
npx expo run:android   # supported device for on-device; otherwise relies on cloud fallback
```

On the simulator or an unsupported device, on-device providers report unavailable — which is
exactly why steps 2 and 4 matter.

## Quick reference

- **API signatures, option/result shapes, provider list, capability fields, error-code table,
  cloud wire protocol:** [`references/api.md`](references/api.md)
- **Runnable patterns** (generate + privacy badge, streaming chat with cancel, structured
  extraction, sessions, cloud config, the React hooks): [`references/recipes.md`](references/recipes.md)
