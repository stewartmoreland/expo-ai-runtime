/**
 * @stewmore/expo-ai-core
 *
 * The provider-agnostic heart of the Expo AI Runtime. Apps use {@link ExpoAI};
 * provider packages implement {@link ExpoAIAdapter} and register it here.
 */

// Public API namespace.
export { ExpoAI, type ExpoAINamespace } from "./ExpoAI.js";

// Types & errors.
export * from "./types.js";
export * from "./errors.js";
export * from "./adapter.js";

// Registry (used by provider packages).
export {
  registerAdapter,
  unregisterAdapter,
  getAdapter,
  getAdapters,
  hasAdapter,
  getRegisteredProviders,
  clearAdapters,
} from "./registry.js";

// Capability detection.
export {
  getAvailability,
  getCapabilities,
  listProviders,
  unavailableCapabilities,
} from "./capability-registry.js";

// Privacy.
export {
  PRIVACY_COPY,
  privacyInfoForProvider,
  privacyModeForProvider,
  providerSendsPromptOffDevice,
  privacyCopyForProvider,
} from "./privacy.js";

// Routing (advanced consumers, evals).
export {
  buildCandidateList,
  selectAvailableAdapter,
  routeGenerate,
  routeStream,
  routeGenerateObject,
  routeGenerateObjectWithMeta,
  routeTask,
  normalizeRequest,
} from "./provider-router.js";

// Sessions.
export { createSession } from "./session-manager.js";

// Structured output.
export {
  validateAgainstSchema,
  extractJson,
  parseJson,
  buildSchemaPrompt,
  buildRepairPrompt,
  generateValidatedObject,
  type ValidationResult,
  type ValidatedObjectResult,
  type GenerateValidatedObjectOptions,
} from "./structured-output.js";

// Shared native-adapter factory (used by the Apple/Android provider packages).
export {
  createNativeAdapter,
  createUnavailableNativeAdapter,
  type NativeAvailability,
  type NativeGenerateResult,
  type NativeStreamEvent,
  type NativeSubscription,
  type NativeStreamingModule,
  type NativeCapabilityProfile,
  type NativeAdapterOptions,
} from "./native-adapter.js";

// Result shaping (used by adapters/sessions).
export { finalizeResult } from "./result.js";

// Async queue (used by adapters that bridge native events).
export { AsyncQueue } from "./async-queue.js";
