---
id: errors
title: Error model
sidebar_position: 7
---

# Error model

All provider and native errors are normalized to a single `ExpoAIError` at the boundary,
so app code handles one shape regardless of which adapter failed.

```ts
export class ExpoAIError extends Error {
  code: ExpoAIErrorCode;
  provider: ExpoAIProvider;
  retryable: boolean;
  fallbackRecommended: boolean;
  nativeMessage?: string;
  detail?: string;
}
```

```ts
export type ExpoAIErrorCode =
  | 'UNAVAILABLE'
  | 'UNSUPPORTED_DEVICE'
  | 'MODEL_NOT_READY'
  | 'MODEL_DOWNLOAD_REQUIRED'
  | 'USER_SETTING_REQUIRED'
  | 'INVALID_PROMPT'
  | 'CONTEXT_WINDOW_EXCEEDED'
  | 'SAFETY_BLOCKED'
  | 'RATE_LIMITED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'NATIVE_PROVIDER_ERROR'
  | 'QUOTA_EXHAUSTED'
  | 'NETWORK_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'ENTITLEMENT_MISSING'
  | 'REFUSAL'
  | 'UNSUPPORTED_SCHEMA'
  | 'UNSUPPORTED_LOCALE'
  | 'TOOL_ERROR'
  | 'CONCURRENT_REQUEST'
  | 'BACKGROUND_NOT_ALLOWED'
  | 'UNKNOWN';
```

- **`retryable`** tells the app whether trying again may succeed (e.g. AICore still
  initializing).
- **`fallbackRecommended`** signals that switching to another provider is the right
  recovery, which the router uses when fallback is allowed.
- **`nativeMessage`** preserves the original platform error for logging without leaking
  it into your normalized handling.
- **`detail`** carries extra provider context when there is some: a model's refusal
  explanation, the unsupported schema keyword, a quota reset date, or `used/limit`
  tokens for a context overflow.

## Defaults per code

When a native module sends only a `code`, these defaults supply the flags.

| Code                      | Retryable | Fallback recommended |
| ------------------------- | --------- | -------------------- |
| `UNAVAILABLE`             | no        | yes                  |
| `UNSUPPORTED_DEVICE`      | no        | yes                  |
| `MODEL_NOT_READY`         | yes       | yes                  |
| `MODEL_DOWNLOAD_REQUIRED` | no        | yes                  |
| `USER_SETTING_REQUIRED`   | no        | yes                  |
| `INVALID_PROMPT`          | no        | no                   |
| `CONTEXT_WINDOW_EXCEEDED` | no        | yes                  |
| `SAFETY_BLOCKED`          | no        | no                   |
| `RATE_LIMITED`            | yes       | yes                  |
| `CANCELLED`               | no        | no                   |
| `TIMEOUT`                 | yes       | yes                  |
| `NATIVE_PROVIDER_ERROR`   | no        | yes                  |
| `QUOTA_EXHAUSTED`         | no        | no                   |
| `NETWORK_UNAVAILABLE`     | yes       | no                   |
| `SERVICE_UNAVAILABLE`     | yes       | no                   |
| `ENTITLEMENT_MISSING`     | no        | no                   |
| `REFUSAL`                 | no        | no                   |
| `UNSUPPORTED_SCHEMA`      | no        | no                   |
| `UNSUPPORTED_LOCALE`      | no        | no                   |
| `TOOL_ERROR`              | yes       | no                   |
| `CONCURRENT_REQUEST`      | yes       | no                   |
| `BACKGROUND_NOT_ALLOWED`  | yes       | no                   |
| `UNKNOWN`                 | no        | yes                  |

The new codes never recommend fallback, so a refusal, quota or network failure is never
silently re-routed to another provider. An unavailable provider whose reason is
`unsupported_locale`, `quota_exhausted` or `entitlement_missing` reports the matching
code instead of `UNAVAILABLE`.
