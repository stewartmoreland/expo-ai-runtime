---
id: roadmap
title: Roadmap
sidebar_position: 1
---

# Roadmap

The runtime ships as a provider layer first; agents, tools, RAG, and memory come after
that foundation is reliable.

## MVP scope

Built first:

```txt
@stewmore/expo-ai-core
@stewmore/expo-ai-apple-foundation-models
@stewmore/expo-ai-android-aicore
@stewmore/expo-ai-cloud
```

MVP features:

- iOS system model provider
- Android system model provider
- Cloud fallback adapter
- Capability detection
- Normalized errors
- Privacy metadata
- Basic structured output
- Basic streaming where native support is available

Deferred: LiteRT-LM, model catalog, model downloads, local RAG, native tools, agent
loop, long-term memory, and Genkit/LangChain bridges.

## Phases

| Phase                                     | Delivers                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. System Provider MVP**                | Core API, iOS + Android adapters, capability detection, generate, sessions, error normalization, privacy metadata                                                        |
| **2. Cloud Fallback + Structured Output** | Cloud adapter, provider routing, `generateObject`, JSON validation + repair, provider metadata on every result                                                           |
| **3. Streaming**                          | Native event streaming, AsyncIterable wrapper, cancellation, timeout handling                                                                                            |
| **4. Task APIs**                          | `summarize`, `rewrite`, `proofread`, image input where available, provider-specific feature mapping                                                                      |
| **5. LiteRT-LM BYOM**                     | LiteRT-LM provider, model file manager, remote download, checksum verification, compatibility metadata                                                                   |
| **6. Local Context / RAG**                | Local search abstraction, app-managed index, `generateWithContext`                                                                                                       |
| **7. Tools + Agent Loop**                 | Tool registry, native iOS tools where available, JS-emulated Android tools, tool-call validation, loop limits, permissions, `requiredTools` checks for [skills](#skills) |
| **8. Backend Framework Bridges**          | Optional Genkit, LangChain, and Vercel AI SDK backend bridges                                                                                                            |

## Skills

Skills are `SKILL.md` files that are compiled into a bundled manifest. They are being
delivered in parts:

- **Merged, ships in the next minor release:** `SKILL.md` parsing and linting, the
  `expo-ai-skills build` CLI, a content-hashed manifest, `skills` on generate, stream,
  object, and session calls, the per-skill `providers` filter, and `result.skills`.
  On-demand activation of `mode: 'prompt'` skills: native on Apple through an
  `activate_skill` Foundation Models tool (iOS 26+), emulated by the runtime on Android
  and cloud.
- **With Dynamic Profiles (iOS 27):** a second native implementation using the
  Foundation Models `Skills` API, which adds turning skills off (`allowsDeactivation`).
- **Deferred to phase 7 (Tools + Agent Loop):** `requiredTools` validation against the
  tool registry.
- **Later:** signed remote manifests.

See [Skills](../concepts/skills.md).

## What v1 proves

- iOS can call Apple Foundation Models through Expo.
- Android can call Gemini Nano through AICore / ML Kit through Expo.
- The same TypeScript API works across both.
- Apps can detect capabilities before showing features.
- Results include provider and privacy metadata.
- Cloud fallback is explicit and controllable.
- Structured output works consistently enough for app features.
