import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Maps native errors into the normalized `ExpoAIError` payload the JS layer
/// understands (docs/prd.md §16). The shape matches `ExpoAIErrorPayload`; the
/// JS `ERROR_DEFAULTS` table supplies `retryable` / `fallbackRecommended`.
enum AppleErrorMapper {
  /// `provider` comes from the call site: PCC errors report `apple-private-cloud-compute`.
  static func payload(for error: Error, provider: String) async -> [String: Any] {
    let (code, detail) = await classify(error)
    var payload: [String: Any] = [
      "code": code,
      "provider": provider,
      "message": error.localizedDescription,
      "nativeMessage": error.localizedDescription,
    ]
    if let detail { payload["detail"] = detail }
    return payload
  }

  /// iOS 27 types first, then the iOS 26 `GenerationError`: which family iOS 27
  /// actually throws at runtime is unknown, so both are handled.
  private static func classify(_ error: Error) async -> (String, String?) {
    if error is CancellationError { return ("CANCELLED", nil) }
    if let error = error as? ExpoAIAppleError {
      switch error {
      case .unsupportedOS: return ("UNSUPPORTED_DEVICE", nil)
      case .sessionNotFound: return ("NATIVE_PROVIDER_ERROR", nil)
      case .unsupportedSchema(let keyword): return ("UNSUPPORTED_SCHEMA", keyword)
      }
    }
    #if canImport(FoundationModels)
    #if canImport(FoundationModels, _version: 2.0)
    if #available(iOS 27.0, macOS 27.0, *), let mapped = await classify27(error) { return mapped }
    #endif
    if #available(iOS 26.0, macOS 26.0, *), let mapped = await classify26(error) { return mapped }
    #endif
    // UNVERIFIED: confirm on device — ENTITLEMENT_MISSING and BACKGROUND_NOT_ALLOWED
    // have no native error; record what a background / unentitled call throws.
    return ("NATIVE_PROVIDER_ERROR", nil)
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, macOS 26.0, *)
  // swiftlint:disable:next cyclomatic_complexity
  private static func classify26(_ error: Error) async -> (String, String?)? {
    if error is GenerationSchema.SchemaError { return ("UNSUPPORTED_SCHEMA", nil) }
    if error is LanguageModelSession.ToolCallError { return ("TOOL_ERROR", nil) }
    guard let error = error as? LanguageModelSession.GenerationError else { return nil }
    switch error {
    case .exceededContextWindowSize: return ("CONTEXT_WINDOW_EXCEEDED", nil)
    case .assetsUnavailable: return ("MODEL_NOT_READY", nil)
    case .guardrailViolation: return ("SAFETY_BLOCKED", nil)
    case .unsupportedGuide: return ("UNSUPPORTED_SCHEMA", nil)
    case .unsupportedLanguageOrLocale: return ("UNSUPPORTED_LOCALE", nil)
    case .decodingFailure: return ("NATIVE_PROVIDER_ERROR", nil)
    case .rateLimited: return ("RATE_LIMITED", nil)
    case .concurrentRequests: return ("CONCURRENT_REQUEST", nil)
    case .refusal(let refusal, _): return await ("REFUSAL", try? refusal.explanation.content)
    @unknown default: return ("NATIVE_PROVIDER_ERROR", nil)
    }
  }
  #endif

  #if canImport(FoundationModels, _version: 2.0)
  @available(iOS 27.0, macOS 27.0, *)
  // swiftlint:disable:next cyclomatic_complexity
  private static func classify27(_ error: Error) async -> (String, String?)? {
    if let error = error as? PrivateCloudComputeLanguageModel.Error {
      switch error {
      case .networkFailure: return ("NETWORK_UNAVAILABLE", nil)
      case .quotaLimitReached(let quota): return ("QUOTA_EXHAUSTED", quota.resetDate.map(iso) ?? quota.debugDescription)
      case .serviceUnavailable: return ("SERVICE_UNAVAILABLE", nil)
      @unknown default: return ("NATIVE_PROVIDER_ERROR", nil)
      }
    }
    if error is LanguageModelSession.Error { return ("CONCURRENT_REQUEST", nil) }
    if error is SystemLanguageModel.Error { return ("MODEL_NOT_READY", nil) }
    if error is GeneratedContent.ParsingError { return ("NATIVE_PROVIDER_ERROR", nil) }
    guard let error = error as? LanguageModelError else { return nil }
    switch error {
    case .contextSizeExceeded(let context):
      return ("CONTEXT_WINDOW_EXCEEDED", "\(context.tokenCount)/\(context.contextSize)")
    case .rateLimited(let limit): return ("RATE_LIMITED", limit.resetDate.map(iso))
    case .guardrailViolation: return ("SAFETY_BLOCKED", nil)
    case .refusal(let refusal): return await ("REFUSAL", try? refusal.explanation.content)
    case .unsupportedCapability: return ("NATIVE_PROVIDER_ERROR", nil)
    case .unsupportedTranscriptContent: return ("INVALID_PROMPT", nil)
    case .unsupportedGenerationGuide: return ("UNSUPPORTED_SCHEMA", nil)
    case .unsupportedLanguageOrLocale: return ("UNSUPPORTED_LOCALE", nil)
    case .timeout: return ("TIMEOUT", nil)
    @unknown default: return ("NATIVE_PROVIDER_ERROR", nil)
    }
  }

  private static func iso(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }
  #endif
}
