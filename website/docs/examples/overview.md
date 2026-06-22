---
id: overview
title: Example apps
sidebar_position: 1
---

# Example apps

Five focused Expo apps demonstrate the runtime, plus a reference cloud server. They share
UI and setup via a private `_shared` package.

| App                               | Demonstrates                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `basic-generate`                  | Capability card + `ExpoAI.generate` with provider/privacy badges and errors    |
| `structured-output`               | `ExpoAI.generateObject` with JSON-schema validation + repair                   |
| `streaming-chat`                  | `ExpoAI.stream` with live tokens and a Stop button                             |
| `cloud-fallback`                  | Sensitivity gating + explicit, privacy-aware cloud routing                     |
| `hooks-demo`                      | `@stewmore/expo-ai-react` hooks + `streamObject`; wired via the config plugins |
| [`server`](./reference-server.md) | Reference cloud backend (mock-by-default)                                      |

## Run an app

These apps include **custom native code**, so they need a **development build** (not Expo
Go).

```bash
# 1) (for cloud fallback / mock cloud) start the reference server
npm run server                       # from the repo root → http://localhost:8787

# 2) align Expo dependency versions for the app you want to run
cd examples/basic-generate
npx expo install --fix               # pins expo-build-properties etc. to this SDK

# 3) build & launch a dev client
npx expo prebuild --clean
npx expo run:ios                     # iOS 26 simulator (Apple Silicon) + Apple Intelligence → on-device
npx expo run:android                 # supported device for on-device; otherwise cloud fallback
```

## What to expect per platform

- **iOS 26 simulator with Apple Intelligence**: capability card shows
  `apple-foundation-models`, results are `on-device`.
- **Older iOS / simulator**: capability shows unavailable; `generate({ fallback: "cloud" })`
  routes to the reference server (`third-party-cloud`).
- **Android emulator**: AICore is usually unavailable → graceful fallback. On a supported
  Gemini Nano device, generation runs on-device.

## Networking note

`_shared` points the cloud adapter at `http://localhost:8787` (and `10.0.2.2` for the
Android emulator). On a physical device, edit `_shared/src/setup.ts` to use your
machine's LAN IP.
