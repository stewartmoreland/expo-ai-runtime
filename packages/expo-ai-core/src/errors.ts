/**
 * Normalized error layer (docs/prd.md §16).
 *
 * Every provider error — native Swift/Kotlin, cloud HTTP, or JS — is funneled
 * into {@link ExpoAIError} so apps and the router can reason about a single,
 * stable error vocabulary.
 */

import type { ExpoAIProvider } from './types.js';

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
  | 'UNKNOWN';

/** Default routing semantics per error code. */
type ErrorDefaults = { retryable: boolean; fallbackRecommended: boolean };

const ERROR_DEFAULTS: Record<ExpoAIErrorCode, ErrorDefaults> = {
  UNAVAILABLE: { retryable: false, fallbackRecommended: true },
  UNSUPPORTED_DEVICE: { retryable: false, fallbackRecommended: true },
  MODEL_NOT_READY: { retryable: true, fallbackRecommended: true },
  MODEL_DOWNLOAD_REQUIRED: { retryable: false, fallbackRecommended: true },
  USER_SETTING_REQUIRED: { retryable: false, fallbackRecommended: true },
  // A malformed prompt will fail the same way everywhere — don't burn a fallback.
  INVALID_PROMPT: { retryable: false, fallbackRecommended: false },
  // A bigger (cloud) model may have room where an on-device model did not.
  CONTEXT_WINDOW_EXCEEDED: { retryable: false, fallbackRecommended: true },
  // Never silently re-route blocked content to a third party.
  SAFETY_BLOCKED: { retryable: false, fallbackRecommended: false },
  RATE_LIMITED: { retryable: true, fallbackRecommended: true },
  CANCELLED: { retryable: false, fallbackRecommended: false },
  TIMEOUT: { retryable: true, fallbackRecommended: true },
  NATIVE_PROVIDER_ERROR: { retryable: false, fallbackRecommended: true },
  UNKNOWN: { retryable: false, fallbackRecommended: true },
};

export type ExpoAIErrorParams = {
  code: ExpoAIErrorCode;
  provider: ExpoAIProvider;
  message?: string;
  retryable?: boolean;
  fallbackRecommended?: boolean;
  nativeMessage?: string;
  cause?: unknown;
};

/** Serialized form emitted by native modules and accepted by {@link ExpoAIError.from}. */
export type ExpoAIErrorPayload = {
  code?: string;
  provider?: ExpoAIProvider;
  message?: string;
  retryable?: boolean;
  fallbackRecommended?: boolean;
  nativeMessage?: string;
};

const KNOWN_CODES = new Set<string>(Object.keys(ERROR_DEFAULTS));

/** Type guard: is `value` one of the canonical {@link ExpoAIErrorCode}s? */
export function isExpoAIErrorCode(value: unknown): value is ExpoAIErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

export class ExpoAIError extends Error {
  readonly code: ExpoAIErrorCode;
  readonly provider: ExpoAIProvider;
  readonly retryable: boolean;
  readonly fallbackRecommended: boolean;
  readonly nativeMessage?: string;

  constructor(params: ExpoAIErrorParams) {
    const defaults = ERROR_DEFAULTS[params.code];
    super(params.message ?? defaultMessage(params.code));
    this.name = 'ExpoAIError';
    this.code = params.code;
    this.provider = params.provider;
    this.retryable = params.retryable ?? defaults.retryable;
    this.fallbackRecommended = params.fallbackRecommended ?? defaults.fallbackRecommended;
    this.nativeMessage = params.nativeMessage;
    if (params.cause !== undefined) {
      (this as { cause?: unknown }).cause = params.cause;
    }
    // Keep instanceof working when targeting ES5-ish runtimes (Hermes).
    Object.setPrototypeOf(this, ExpoAIError.prototype);
  }

  /**
   * Normalize any thrown value into an {@link ExpoAIError}. Understands existing
   * ExpoAIErrors, native error payloads ({@link ExpoAIErrorPayload}), and plain
   * Errors / unknowns.
   */
  static from(value: unknown, provider: ExpoAIProvider): ExpoAIError {
    if (value instanceof ExpoAIError) return value;

    if (isErrorPayload(value)) {
      const code = isExpoAIErrorCode(value.code) ? value.code : 'NATIVE_PROVIDER_ERROR';
      return new ExpoAIError({
        code,
        provider: value.provider ?? provider,
        message: value.message,
        retryable: value.retryable,
        fallbackRecommended: value.fallbackRecommended,
        nativeMessage: value.nativeMessage ?? value.message,
        cause: value,
      });
    }

    if (value instanceof Error) {
      if (value.name === 'AbortError') {
        return new ExpoAIError({
          code: 'CANCELLED',
          provider,
          message: value.message,
          cause: value,
        });
      }
      return new ExpoAIError({
        code: 'NATIVE_PROVIDER_ERROR',
        provider,
        message: value.message,
        nativeMessage: value.message,
        cause: value,
      });
    }

    return new ExpoAIError({
      code: 'UNKNOWN',
      provider,
      message: typeof value === 'string' ? value : 'An unknown error occurred.',
      cause: value,
    });
  }

  toJSON(): Required<Omit<ExpoAIErrorParams, 'cause'>> {
    return {
      code: this.code,
      provider: this.provider,
      message: this.message,
      retryable: this.retryable,
      fallbackRecommended: this.fallbackRecommended,
      nativeMessage: this.nativeMessage ?? '',
    };
  }
}

function isErrorPayload(value: unknown): value is ExpoAIErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

function defaultMessage(code: ExpoAIErrorCode): string {
  switch (code) {
    case 'UNAVAILABLE':
      return 'No AI provider is available for this request.';
    case 'UNSUPPORTED_DEVICE':
      return 'This device does not support the requested AI provider.';
    case 'MODEL_NOT_READY':
      return 'The on-device model is initializing. Try again shortly.';
    case 'MODEL_DOWNLOAD_REQUIRED':
      return 'The on-device model must be downloaded before use.';
    case 'USER_SETTING_REQUIRED':
      return 'A system setting must be enabled to use this AI provider.';
    case 'INVALID_PROMPT':
      return 'The prompt was empty or invalid.';
    case 'CONTEXT_WINDOW_EXCEEDED':
      return "The prompt exceeds the model's context window.";
    case 'SAFETY_BLOCKED':
      return "The request was blocked by the provider's safety system.";
    case 'RATE_LIMITED':
      return 'The provider is rate limiting requests. Try again later.';
    case 'CANCELLED':
      return 'The request was cancelled.';
    case 'TIMEOUT':
      return 'The request timed out.';
    case 'NATIVE_PROVIDER_ERROR':
      return 'The native AI provider reported an error.';
    case 'UNKNOWN':
    default:
      return 'An unknown error occurred.';
  }
}
