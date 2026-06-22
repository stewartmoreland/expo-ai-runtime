# expo-ai-runtime — API reference

Source of truth: `packages/expo-ai-core/src/{ExpoAI,types,errors}.ts`,
`packages/expo-ai-cloud/src/cloud-provider.ts`, `packages/expo-ai-react/src/*`. Everything below
is exported from `@stewmore/expo-ai-core` unless noted.

## Contents

- [The `ExpoAI` namespace](#the-expoai-namespace)
- [Request options](#request-options)
- [Results, chunks, streamed objects](#results-chunks-streamed-objects)
- [Capabilities & availability](#capabilities--availability)
- [Providers & fallback](#providers--fallback)
- [Privacy](#privacy)
- [JSON schema subset](#json-schema-subset)
- [Sessions](#sessions)
- [Task helpers](#task-helpers)
- [Errors](#errors)
- [Cloud adapter & wire protocol](#cloud-adapter--wire-protocol)
- [React hooks](#react-hooks)

## The `ExpoAI` namespace

```ts
ExpoAI.getAvailability(): Promise<ExpoAIAvailability>      // best available provider
ExpoAI.getCapabilities(): Promise<ExpoAICapabilities>      // best available provider
ExpoAI.listProviders():  Promise<ExpoAIProviderInfo[]>     // all registered providers

ExpoAI.generate(options: GenerateOptions): Promise<GenerateResult>
ExpoAI.stream(options: GenerateOptions): AsyncIterable<GenerateChunk>   // throws ExpoAIError
ExpoAI.generateObject<T>(options: GenerateObjectOptions): Promise<T>
ExpoAI.streamObject<T>(options: StreamObjectOptions): StreamObjectResult<T>   // sync return, async fields

ExpoAI.createSession(options?: CreateSessionOptions): Promise<ExpoAISession>

ExpoAI.summarize(options: SummarizeOptions): Promise<GenerateResult>
ExpoAI.rewrite(options: RewriteOptions):   Promise<GenerateResult>
ExpoAI.proofread(options: ProofreadOptions): Promise<GenerateResult>

ExpoAI.registerAdapter(adapter) / unregisterAdapter(provider) / clearAdapters()  // usually called by provider packages
```

`stream` returns an async iterable that **throws** an `ExpoAIError` if generation fails — wrap the
`for await` in try/catch. `streamObject` returns synchronously; its `object` / `result` promises
reject (and its streams throw) on failure.

## Request options

```ts
type GenerateOptions = {
  prompt: string;
  provider?: ExpoAIProvider;     // force a provider; omit / 'system-preferred' = default priority
  fallback?: ExpoAIFallback;     // 'none' (default) | 'cloud' | 'any'
  instructions?: string;         // system / role instructions
  temperature?: number;
  maxOutputTokens?: number;
  sensitive?: boolean;           // true ⇒ router refuses third-party cloud (see Privacy)
  model?: LocalModelConfig;      // BYOM descriptor (LiteRT-LM; future)
  metadata?: Record<string, string>;
  signal?: AbortSignal;          // cancels native + cloud streaming
};

type GenerateObjectOptions = GenerateOptions & {
  schema: JSONSchema;
  schemaName?: string;
  maxRepairAttempts?: number;    // validate→repair cycles; default 2
};

type StreamObjectOptions = GenerateObjectOptions;
```

## Results, chunks, streamed objects

```ts
type GenerateResult = {
  text: string;
  provider: ExpoAIProvider;
  privacy: ExpoAIPrivacyInfo;
  usedFallback: boolean;         // true when router used a non-primary provider
  finishReason?: ExpoAIFinishReason;  // 'stop' | 'length' | 'cancelled' | 'safety' | 'tool_calls' | 'unknown'
  usage?: ExpoAIUsage;           // { inputTokens?, outputTokens?, totalTokens? }
  raw?: unknown;
};

type GenerateChunk =
  | { type: 'start'; provider: ExpoAIProvider; privacy: ExpoAIPrivacyInfo }
  | { type: 'delta'; text: string }
  | { type: 'done'; result: GenerateResult };

interface StreamObjectResult<T> {
  partialObjectStream: AsyncIterable<DeepPartial<T>>; // progressively-complete snapshots; last === object
  textStream: AsyncIterable<string>;                  // raw token deltas
  object: Promise<T>;                                 // validated (repaired) final value
  result: Promise<GenerateResult>;                    // provider/privacy/usedFallback metadata
}
```

## Capabilities & availability

```ts
type ExpoAIAvailability = {
  available: boolean;
  provider: ExpoAIProvider;
  reasonUnavailable?: ExpoAIUnavailableReason;
};

type ExpoAICapabilities = {
  available: boolean;
  provider: ExpoAIProvider;
  isOnDevice: boolean;
  isSystemManagedModel: boolean;
  sendsPromptOffDevice: boolean;
  supportsTextGeneration: boolean;
  supportsStreaming: boolean;
  supportsSessions: boolean;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsImageInput: boolean;
  supportsSpeechInput: boolean;
  supportsSummarization: boolean;
  supportsRewrite: boolean;
  supportsProofreading: boolean;
  supportsBringYourOwnModel: boolean;
  supportsModelDownload: boolean;
  contextWindow?: number;
  reasonUnavailable?: ExpoAIUnavailableReason;
};

type ExpoAIUnavailableReason =
  | 'unsupported_os_version' | 'unsupported_device' | 'model_not_downloaded'
  | 'model_initializing' | 'apple_intelligence_disabled' | 'aicore_unavailable'
  | 'aicore_initializing' | 'unsupported_bootloader_state' | 'missing_dependency'
  | 'provider_not_configured' | 'unknown';

// listProviders() and useCapabilities().providers return THIS — note the
// capabilities live under `.capabilities`, not directly on the object:
type ExpoAIProviderInfo = { provider: ExpoAIProvider; capabilities: ExpoAICapabilities };
```

`listProviders()` resolves `ExpoAIProviderInfo[]`; the `useCapabilities` hook exposes
`providers: ExpoAIProviderInfo[] | null` (null while loading). To render the list, read
availability off `.capabilities`:

```ts
providers?.map((p) => `${p.provider}: ${p.capabilities.available ? 'ready' : p.capabilities.reasonUnavailable}`)
```

## Providers & fallback

```ts
type ExpoAIProvider =
  | 'system-preferred'
  | 'apple-foundation-models'       // iOS on-device
  | 'apple-private-cloud-compute'   // Apple-managed, privacy-preserving
  | 'android-aicore-gemini-nano'    // Android on-device
  | 'litert-lm'                     // bring-your-own local model (future)
  | 'cloud'                         // app-controlled cloud fallback
  | 'none';

const defaultProviderPriority = [
  'apple-foundation-models',
  'apple-private-cloud-compute',
  'android-aicore-gemini-nano',
  'litert-lm',
  'cloud',
];

type ExpoAIFallback = 'none' | 'cloud' | 'any';
```

Router behavior: build candidates (requested provider, else default priority) → filter to
available → apply the sensitivity gate → use the first eligible adapter, stamping
`usedFallback: true` if it wasn't the primary. `cloud` only enters the candidate set when
explicitly requested or `fallback` is `'cloud'`/`'any'`.

## Privacy

```ts
type ExpoAIPrivacyMode = 'on-device' | 'apple-private-cloud-compute' | 'third-party-cloud' | 'unknown';

type ExpoAIPrivacyInfo = {
  provider: ExpoAIProvider;
  isOnDevice: boolean;
  sendsPromptOffDevice: boolean;
  privacyMode: ExpoAIPrivacyMode;
};

// Helpers (from @stewmore/expo-ai-core):
PRIVACY_COPY: Record<ExpoAIPrivacyMode, string>;   // ready-made disclosure strings
privacyCopyForProvider(provider): string;
privacyModeForProvider(provider): ExpoAIPrivacyMode;
providerSendsPromptOffDevice(provider): boolean;
```

Rule: a `sensitive: true` prompt is never routed to `cloud` (third-party). On-device providers
and `apple-private-cloud-compute` remain eligible.

## JSON schema subset

`generateObject` / `streamObject` validate against this runtime subset (unknown keywords pass
through but aren't enforced):

```ts
interface JSONSchema {
  type?: ('object'|'array'|'string'|'number'|'integer'|'boolean'|'null') | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;          // include these — they steer the model
  minimum?: number; maximum?: number;
  minItems?: number; maxItems?: number;
  minLength?: number; maxLength?: number;
  [key: string]: unknown;
}
```

Validation that fails triggers a repair re-prompt (up to `maxRepairAttempts`, default 2). Keep
schemas small and add `description`s; on-device models have small context windows
(Apple FM `contextWindow` is 4096).

## Sessions

```ts
type CreateSessionOptions = {
  instructions?: string; provider?: ExpoAIProvider; fallback?: ExpoAIFallback;
  temperature?: number; maxOutputTokens?: number; metadata?: Record<string, string>;
};

interface ExpoAISession {
  readonly id: string;
  readonly provider: ExpoAIProvider;
  generate(options: SessionGenerateOptions): Promise<GenerateResult>;
  stream(options: SessionGenerateOptions): AsyncIterable<GenerateChunk>;
  generateObject<T>(options: SessionGenerateObjectOptions): Promise<T>;
  reset(): Promise<void>;       // clear transcript, keep the session
  dispose(): Promise<void>;     // release native resources — always call when done
}

type SessionGenerateOptions = { prompt: string; temperature?: number; maxOutputTokens?: number; signal?: AbortSignal };
```

Sessions are native-backed where supported and transcript-emulated otherwise — same interface
either way. Always `dispose()` (e.g. on unmount) to free native resources.

## Task helpers

```ts
type SummarizeOptions = { text: string; length?: 'short'|'medium'|'long'; provider?; fallback?; sensitive?; signal? };
type RewriteOptions   = { text: string; style?: RewriteStyle; provider?; fallback?; sensitive?; signal? };
type ProofreadOptions = { text: string; provider?; fallback?; sensitive?; signal? };

type RewriteStyle = 'rephrase' | 'shorten' | 'elaborate' | 'friendly' | 'professional' | 'emojify';
```

Each returns a `GenerateResult`. They use a native task API when the provider has one, and a
prompt-emulated path otherwise.

## Errors

```ts
class ExpoAIError extends Error {
  code: ExpoAIErrorCode;
  provider: ExpoAIProvider;
  retryable: boolean;
  fallbackRecommended: boolean;
  nativeMessage?: string;
  static from(value: unknown, provider: ExpoAIProvider): ExpoAIError;
  toJSON(): { code, provider, message, retryable, fallbackRecommended, nativeMessage };
}
```

Default routing semantics per code (override via constructor params if needed):

| Code | retryable | fallbackRecommended | Meaning |
| --- | --- | --- | --- |
| `UNAVAILABLE` | no | yes | No provider available for this request. |
| `UNSUPPORTED_DEVICE` | no | yes | Device can't run the requested provider. |
| `MODEL_NOT_READY` | **yes** | yes | On-device model still initializing — retry shortly. |
| `MODEL_DOWNLOAD_REQUIRED` | no | yes | Model must be downloaded first. |
| `USER_SETTING_REQUIRED` | no | yes | A system setting (e.g. Apple Intelligence) must be on. |
| `INVALID_PROMPT` | no | **no** | Empty/malformed prompt — fails everywhere; don't fall back. |
| `CONTEXT_WINDOW_EXCEEDED` | no | yes | Too long for this model; a bigger one may fit. |
| `SAFETY_BLOCKED` | no | **no** | Blocked by safety — never silently re-route to a third party. |
| `RATE_LIMITED` | **yes** | yes | Back off / try later. |
| `CANCELLED` | no | no | Aborted via `signal`. Treat as intentional, not an error UI. |
| `TIMEOUT` | **yes** | yes | Timed out. |
| `NATIVE_PROVIDER_ERROR` | no | yes | Underlying native/cloud error. |
| `UNKNOWN` | no | yes | Unclassified. |

`isExpoAIErrorCode(value)` is exported for guarding raw payloads.

**Cancellation:** aborting via `signal` throws an `ExpoAIError` with `code: 'CANCELLED'` from
`generate` / `generateObject` / `stream` / the task helpers (it does **not** resolve with
`finishReason: 'cancelled'`). `finishReason: 'cancelled'` only appears when a native adapter
reports it. The React hooks already swallow `CANCELLED` — they never set `error` on a user stop.

## Cloud adapter & wire protocol

```ts
import { configureCloud, createCloudAdapter, getCloudAdapter } from '@stewmore/expo-ai-cloud';

type CloudProviderConfig = {
  endpoint: string;                 // base URL, e.g. "https://api.example.com"
  headers?: Record<string, string>;
  provider?: 'openai' | 'gemini' | 'anthropic' | 'bedrock' | 'custom';  // informational
  fetch?: typeof fetch;             // pass expo/fetch in RN; defaults to globalThis.fetch
  generatePath?: string;            // default '/v1/generate'
  streamPath?: string;              // default '/v1/stream'
};
```

- `configureCloud(config): CloudAdapter` creates **and registers** the adapter (router can now use `cloud`).
- `createCloudAdapter(config): CloudAdapter` creates without registering.
- `getCloudAdapter(): CloudAdapter | undefined` returns the last configured adapter.
- `config.provider` is **informational only** — it never goes on the wire and does not change paths/payload.

Backend contract (served by `examples/server`):

```
POST {generatePath}  ->  { text, finishReason?, usage? }
POST {streamPath}    ->  SSE frames: data: {"type":"delta","text":"…"}
                                     data: {"type":"done","finishReason":"stop"}   (optional)
                                     data: [DONE]
                         errors:    data: {"type":"error","code":"RATE_LIMITED","message":"…"}
```

HTTP status → error code mapping on non-2xx: 429→`RATE_LIMITED`, 400/422→`INVALID_PROMPT`,
408/504→`TIMEOUT`, 413→`CONTEXT_WINDOW_EXCEEDED`, else→`NATIVE_PROVIDER_ERROR`. A backend may also
return `{ "code": "<ExpoAIErrorCode>", ... }` to set the code directly.

## React hooks

From `@stewmore/expo-ai-react`. All own an `AbortController`, cancel on unmount, and never surface
cancellation as `error`.

```ts
// providers is ExpoAIProviderInfo[] | null — read availability off p.capabilities (see above).
useCapabilities(): { capabilities, availability, providers, loading, error, refresh() }

useGenerate(): {
  generate(options: GenerateOptions): Promise<GenerateResult | undefined>;
  stream(options: GenerateOptions): Promise<GenerateResult | undefined>;
  text: string; result: GenerateResult | null; isLoading; error; stop(); reset();
}

useObject<T>(): {
  submit(options: StreamObjectOptions): Promise<T | undefined>;
  object: DeepPartial<T> | null; isLoading; error; stop(); reset();
}

useChat(options?: CreateSessionOptions): {
  messages: ChatMessage[]; input; setInput(v); append(content?): Promise<void>;
  isLoading; error; stop(); reset();
}
// ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
```

`append()` pushes a user message **plus an empty assistant placeholder**, then grows that
placeholder's `content` in place as deltas stream — so render a typing indicator when an
assistant message is still empty. `isLoading` is the only in-flight signal. On error the empty
placeholder is removed and `error` is set; cancellation (`stop()`) is never surfaced as `error`.
