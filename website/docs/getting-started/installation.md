---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

Install the core package, plus whichever native or cloud adapters your app needs.

```bash
# Core (required) — pure TypeScript, no native code
npm install @stewmore/expo-ai-core

# iOS on-device (Apple Foundation Models)
npm install @stewmore/expo-ai-apple-foundation-models

# Android on-device (Gemini Nano via AICore)
npm install @stewmore/expo-ai-android-aicore

# Cloud fallback adapter
npm install @stewmore/expo-ai-cloud
```

Adapters register themselves at **import time**, guarded by `Platform.OS`. Importing a
package on the wrong platform is a no-op — it registers an always-unavailable adapter
rather than throwing.

```ts
import { ExpoAI } from "@stewmore/expo-ai-core";
import "@stewmore/expo-ai-apple-foundation-models"; // registers the iOS adapter
import "@stewmore/expo-ai-android-aicore";          // registers the Android adapter
```

## Development build required

The native adapters ship **custom native code**, so example apps and any app using them
require a **development build** — they do not run in Expo Go.

```bash
npx expo prebuild
npx expo run:ios       # iOS 26 simulator (Apple Silicon) with Apple Intelligence enabled
npx expo run:android   # supported device for on-device; otherwise cloud fallback
```

The pure-TypeScript packages (`expo-ai-core`, `expo-ai-cloud`, `expo-ai-evals`) have no
native dependencies and run anywhere, including Node for tests and evals.
