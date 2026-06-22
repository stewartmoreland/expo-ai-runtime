/**
 * The public, capability-first API surface (docs/prd.md §6).
 *
 * Thin ergonomic layer over the router, capability registry, and session
 * manager. Native/cloud adapters are registered into the core registry (usually
 * at import time); this namespace never talks to native modules directly.
 */

import { getAvailability, getCapabilities, listProviders } from './capability-registry.js';
import { routeGenerate, routeGenerateObject, routeStream, routeTask } from './provider-router.js';
import { clearAdapters, registerAdapter, unregisterAdapter } from './registry.js';
import { createSession } from './session-manager.js';
import type {
  CreateSessionOptions,
  GenerateChunk,
  GenerateObjectOptions,
  GenerateOptions,
  GenerateResult,
  ProofreadOptions,
  RewriteOptions,
  SummarizeOptions,
} from './types.js';

export const ExpoAI = {
  /** Availability of the best currently-available provider. */
  getAvailability,
  /** Capabilities of the best currently-available provider. */
  getCapabilities,
  /** Every registered provider and its capabilities. */
  listProviders,

  /** One-shot text generation with optional fallback. */
  generate(options: GenerateOptions): Promise<GenerateResult> {
    return routeGenerate(options);
  },

  /** Streamed text generation. The iterable throws an {@link ExpoAIError} on failure. */
  stream(options: GenerateOptions): AsyncIterable<GenerateChunk> {
    return routeStream(options);
  },

  /** Create a cross-platform session (native when supported, emulated otherwise). */
  createSession(options?: CreateSessionOptions): Promise<import('./types.js').ExpoAISession> {
    return createSession(options);
  },

  /** Generate an object validated against a JSON schema (with repair). */
  generateObject<T = unknown>(options: GenerateObjectOptions): Promise<T> {
    return routeGenerateObject<T>(options);
  },

  /** Summarize text (native task API when available, prompt-emulated otherwise). */
  summarize(options: SummarizeOptions): Promise<GenerateResult> {
    return routeTask('summarize', {
      text: options.text,
      provider: options.provider,
      fallback: options.fallback,
      sensitive: options.sensitive,
      signal: options.signal,
      length: options.length,
    });
  },

  /** Rewrite text in a given style. */
  rewrite(options: RewriteOptions): Promise<GenerateResult> {
    return routeTask('rewrite', {
      text: options.text,
      provider: options.provider,
      fallback: options.fallback,
      sensitive: options.sensitive,
      signal: options.signal,
      style: options.style,
    });
  },

  /** Proofread text. */
  proofread(options: ProofreadOptions): Promise<GenerateResult> {
    return routeTask('proofread', {
      text: options.text,
      provider: options.provider,
      fallback: options.fallback,
      sensitive: options.sensitive,
      signal: options.signal,
    });
  },

  /** Register a provider adapter. Normally called by provider packages on import. */
  registerAdapter,
  /** Remove a provider adapter. */
  unregisterAdapter,
  /** Remove every registered adapter (mostly useful in tests). */
  clearAdapters,
} as const;

export type ExpoAINamespace = typeof ExpoAI;
