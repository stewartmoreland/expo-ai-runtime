/**
 * @stewmore/expo-ai-react
 *
 * React hooks for the Expo AI Runtime — `ai/react`-style ergonomics over the
 * provider-agnostic {@link @stewmore/expo-ai-core} package. All hooks own an
 * AbortController so `stop()` and unmount cancel cleanly, guard state updates
 * after unmount, and treat cancellation as intentional (never an `error`).
 */

export { useCapabilities, type UseCapabilitiesResult } from './useCapabilities.js';
export { useGenerate, type UseGenerateResult } from './useGenerate.js';
export { useObject, type UseObjectResult } from './useObject.js';
export {
  useChat,
  type UseChatResult,
  type ChatMessage,
  type ChatRole,
} from './useChat.js';
