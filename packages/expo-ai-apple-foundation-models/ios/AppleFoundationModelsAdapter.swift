import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Wraps Apple's on-device Foundation Models framework (iOS 26+).
///
/// NOTE: the FoundationModels API is new; property/method names here follow the
/// WWDC25 documentation. If a symbol differs in your installed SDK (e.g. the
/// streaming snapshot's text accessor), adjust it — everything is gated behind
/// `if #available(iOS 26.0, *)` so the module links on older deployment targets.
enum AppleFoundationModelsAdapter {
  static let provider = "apple-foundation-models"
  static let defaultInstructions = "You are a helpful, concise assistant."

  // MARK: Availability

  static func availability() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      switch SystemLanguageModel.default.availability {
      case .available:
        return ["available": true, "provider": provider]
      case .unavailable(let reason):
        return ["available": false, "provider": provider, "reasonUnavailable": mapReason(reason)]
      @unknown default:
        return ["available": false, "provider": provider, "reasonUnavailable": "unknown"]
      }
    } else {
      return ["available": false, "provider": provider, "reasonUnavailable": "unsupported_os_version"]
    }
    #else
    return ["available": false, "provider": provider, "reasonUnavailable": "missing_dependency"]
    #endif
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, macOS 26.0, *)
  private static func mapReason(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
    switch reason {
    case .deviceNotEligible:
      return "unsupported_device"
    case .appleIntelligenceNotEnabled:
      return "apple_intelligence_disabled"
    case .modelNotReady:
      return "model_initializing"
    @unknown default:
      return "unknown"
    }
  }
  #endif

  // MARK: Generation

  #if canImport(FoundationModels)
  @available(iOS 26.0, macOS 26.0, *)
  static func generate(_ options: [String: Any]) async throws -> [String: Any] {
    let session = LanguageModelSession(
      instructions: options["instructions"] as? String ?? defaultInstructions
    )
    return try await respond(session: session, options: options)
  }

  @available(iOS 26.0, macOS 26.0, *)
  static func generate(inSession id: String, options: [String: Any]) async throws -> [String: Any] {
    guard let session = AppleSessionStore.shared.session(for: id) else {
      throw ExpoAIAppleError.sessionNotFound
    }
    return try await respond(session: session, options: options)
  }

  @available(iOS 26.0, macOS 26.0, *)
  private static func respond(
    session: LanguageModelSession,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let prompt = options["prompt"] as? String ?? ""
    let response = try await session.respond(to: prompt, options: makeGenerationOptions(options))
    return ["text": response.content, "finishReason": "stop"]
  }

  @available(iOS 26.0, macOS 26.0, *)
  static func makeGenerationOptions(_ options: [String: Any]) -> GenerationOptions {
    var generationOptions = GenerationOptions()
    if let temperature = options["temperature"] as? Double {
      generationOptions.temperature = temperature
    }
    if let maxTokens = options["maxOutputTokens"] as? Int {
      generationOptions.maximumResponseTokens = maxTokens
    }
    return generationOptions
  }
  #endif
}

enum ExpoAIAppleError: Error, LocalizedError {
  case unsupportedOS
  case sessionNotFound

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Apple Foundation Models requires iOS 26 or newer."
    case .sessionNotFound:
      return "The requested AI session no longer exists."
    }
  }
}
