import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Maps native errors into the normalized `ExpoAIError` payload the JS layer
/// understands (docs/prd.md §16). The shape matches `ExpoAIErrorPayload`.
enum AppleErrorMapper {
  static let provider = "apple-foundation-models"

  static func payload(for error: Error) -> [String: Any] {
    var code = "NATIVE_PROVIDER_ERROR"
    var retryable = false
    var fallbackRecommended = true

    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *),
       let generationError = error as? LanguageModelSession.GenerationError {
      switch generationError {
      case .exceededContextWindowSize:
        code = "CONTEXT_WINDOW_EXCEEDED"
      case .guardrailViolation:
        code = "SAFETY_BLOCKED"
        fallbackRecommended = false
      case .refusal:
        code = "SAFETY_BLOCKED"
        fallbackRecommended = false
      case .assetsUnavailable:
        code = "MODEL_NOT_READY"
        retryable = true
      case .unsupportedLanguageOrLocale:
        code = "INVALID_PROMPT"
        fallbackRecommended = false
      case .rateLimited:
        code = "RATE_LIMITED"
        retryable = true
      case .decodingFailure:
        code = "NATIVE_PROVIDER_ERROR"
      default:
        code = "NATIVE_PROVIDER_ERROR"
      }
    }
    #endif

    return [
      "code": code,
      "provider": provider,
      "message": error.localizedDescription,
      "retryable": retryable,
      "fallbackRecommended": fallbackRecommended,
      "nativeMessage": error.localizedDescription,
    ]
  }
}
