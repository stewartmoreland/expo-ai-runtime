import { describe, expect, it } from 'vitest';

import { ExpoAIError } from '../index.js';

describe('ExpoAIError', () => {
  it('applies code-based defaults for retryable / fallbackRecommended', () => {
    const safety = new ExpoAIError({ code: 'SAFETY_BLOCKED', provider: 'cloud' });
    expect(safety.retryable).toBe(false);
    expect(safety.fallbackRecommended).toBe(false);

    const notReady = new ExpoAIError({
      code: 'MODEL_NOT_READY',
      provider: 'apple-foundation-models',
    });
    expect(notReady.retryable).toBe(true);
    expect(notReady.fallbackRecommended).toBe(true);
  });

  it('defaults the newer codes to no fallback', () => {
    const expected = {
      QUOTA_EXHAUSTED: false,
      NETWORK_UNAVAILABLE: true,
      SERVICE_UNAVAILABLE: true,
      ENTITLEMENT_MISSING: false,
      REFUSAL: false,
      UNSUPPORTED_SCHEMA: false,
      UNSUPPORTED_LOCALE: false,
      TOOL_ERROR: true,
      CONCURRENT_REQUEST: true,
      BACKGROUND_NOT_ALLOWED: true,
    } as const;
    for (const [code, retryable] of Object.entries(expected)) {
      const error = ExpoAIError.from({ code }, 'apple-foundation-models');
      expect(error).toMatchObject({ code, retryable, fallbackRecommended: false });
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('lets explicit params override defaults', () => {
    const error = new ExpoAIError({
      code: 'SAFETY_BLOCKED',
      provider: 'cloud',
      fallbackRecommended: true,
    });
    expect(error.fallbackRecommended).toBe(true);
  });

  it('is a real Error (instanceof + message)', () => {
    const error = new ExpoAIError({ code: 'TIMEOUT', provider: 'cloud', message: 'boom' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExpoAIError);
    expect(error.message).toBe('boom');
  });

  describe('from()', () => {
    it('passes ExpoAIError through unchanged', () => {
      const original = new ExpoAIError({ code: 'RATE_LIMITED', provider: 'cloud' });
      expect(ExpoAIError.from(original, 'apple-foundation-models')).toBe(original);
    });

    it('maps a native error payload by code', () => {
      const payload = {
        code: 'CONTEXT_WINDOW_EXCEEDED',
        message: 'too long',
        retryable: false,
      };
      const error = ExpoAIError.from(payload, 'android-aicore-gemini-nano');
      expect(error.code).toBe('CONTEXT_WINDOW_EXCEEDED');
      expect(error.provider).toBe('android-aicore-gemini-nano');
      expect(error.fallbackRecommended).toBe(true);
    });

    it('downgrades an unknown native code to NATIVE_PROVIDER_ERROR', () => {
      const error = ExpoAIError.from({ code: 'SOMETHING_WEIRD', message: '?' }, 'cloud');
      expect(error.code).toBe('NATIVE_PROVIDER_ERROR');
      expect(error.nativeMessage).toBe('?');
    });

    it('maps an AbortError to CANCELLED', () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      expect(ExpoAIError.from(abort, 'cloud').code).toBe('CANCELLED');
    });

    it('wraps a plain Error as NATIVE_PROVIDER_ERROR', () => {
      const error = ExpoAIError.from(new Error('kaboom'), 'cloud');
      expect(error.code).toBe('NATIVE_PROVIDER_ERROR');
      expect(error.nativeMessage).toBe('kaboom');
    });

    it('wraps a string/unknown as UNKNOWN', () => {
      expect(ExpoAIError.from('weird', 'cloud').code).toBe('UNKNOWN');
    });
  });

  it('serializes to a stable JSON payload', () => {
    const error = new ExpoAIError({
      code: 'RATE_LIMITED',
      provider: 'cloud',
      message: 'slow down',
    });
    expect(error.toJSON()).toEqual({
      code: 'RATE_LIMITED',
      provider: 'cloud',
      message: 'slow down',
      retryable: true,
      fallbackRecommended: true,
      nativeMessage: '',
    });
  });

  it('round-trips detail through from() and toJSON()', () => {
    const error = ExpoAIError.from(
      { code: 'REFUSAL', detail: 'I cannot help with that.' },
      'apple-foundation-models',
    );
    expect(error.detail).toBe('I cannot help with that.');
    expect(error.toJSON()).toMatchObject({ code: 'REFUSAL', detail: 'I cannot help with that.' });
    expect('detail' in new ExpoAIError({ code: 'TIMEOUT', provider: 'cloud' }).toJSON()).toBe(
      false,
    );
  });
});
