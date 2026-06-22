/**
 * Adapter registry.
 *
 * Provider packages call {@link registerAdapter} at import time (guarded by
 * `Platform.OS` on their side). The registry is the single source of truth for
 * which providers exist in the current process. {@link clearAdapters} keeps the
 * core unit-testable.
 */

import type { ExpoAIAdapter } from './adapter.js';
import type { ExpoAIProvider } from './types.js';

const adapters = new Map<ExpoAIProvider, ExpoAIAdapter>();

export function registerAdapter(adapter: ExpoAIAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function unregisterAdapter(provider: ExpoAIProvider): void {
  adapters.delete(provider);
}

export function getAdapter(provider: ExpoAIProvider): ExpoAIAdapter | undefined {
  return adapters.get(provider);
}

export function hasAdapter(provider: ExpoAIProvider): boolean {
  return adapters.has(provider);
}

export function getAdapters(): ExpoAIAdapter[] {
  return [...adapters.values()];
}

export function getRegisteredProviders(): ExpoAIProvider[] {
  return [...adapters.keys()];
}

/** Test/reset hook — removes every registered adapter. */
export function clearAdapters(): void {
  adapters.clear();
}
