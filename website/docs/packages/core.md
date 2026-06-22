---
id: core
title: expo-ai-core
sidebar_position: 1
---

# @stewmore/expo-ai-core

The pure-TypeScript heart of the runtime. It owns the public `ExpoAI` API, the
`ExpoAIAdapter` contract, the provider router, the capability registry, sessions,
structured-output validation/repair, privacy, and normalized errors. It has **no React
Native or native imports**, so it unit-tests in Node.

```bash
npm install @stewmore/expo-ai-core
```

## The `ExpoAI` API

```ts
export namespace ExpoAI {
  export function getAvailability(): Promise<ExpoAIAvailability>;
  export function getCapabilities(): Promise<ExpoAICapabilities>;
  export function listProviders(): Promise<ExpoAIProviderInfo[]>;

  export function generate(options: GenerateOptions): Promise<GenerateResult>;
  export function stream(options: GenerateOptions): AsyncIterable<GenerateChunk>;

  export function createSession(options?: CreateSessionOptions): Promise<ExpoAISession>;
  export function generateObject<T>(options: GenerateObjectOptions): Promise<T>;

  export function summarize(options: SummarizeOptions): Promise<GenerateResult>;
  export function rewrite(options: RewriteOptions): Promise<GenerateResult>;
  export function proofread(options: ProofreadOptions): Promise<GenerateResult>;
}
```

The native adapters are registered against the core registry by importing their package
(a side-effect import). The core itself never depends on a native module.

## Related concepts

- [Providers & routing](../concepts/providers.md)
- [Capability detection](../concepts/capabilities.mdx)
- [Sessions](../concepts/sessions.md)
- [Structured output](../concepts/structured-output.md)
- [Privacy model](../concepts/privacy.md)
- [Error model](../concepts/errors.md)
