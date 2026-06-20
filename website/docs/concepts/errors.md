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
}
```

```ts
export type ExpoAIErrorCode =
  | "UNAVAILABLE"
  | "UNSUPPORTED_DEVICE"
  | "MODEL_NOT_READY"
  | "MODEL_DOWNLOAD_REQUIRED"
  | "USER_SETTING_REQUIRED"
  | "INVALID_PROMPT"
  | "CONTEXT_WINDOW_EXCEEDED"
  | "SAFETY_BLOCKED"
  | "RATE_LIMITED"
  | "CANCELLED"
  | "TIMEOUT"
  | "NATIVE_PROVIDER_ERROR"
  | "UNKNOWN";
```

- **`retryable`** tells the app whether trying again may succeed (e.g. AICore still
  initializing).
- **`fallbackRecommended`** signals that switching to another provider is the right
  recovery, which the router uses when fallback is allowed.
- **`nativeMessage`** preserves the original platform error for logging without leaking
  it into your normalized handling.
