import Foundation

#if canImport(FoundationModels, _version: 2.0)
import FoundationModels
#endif

/// Apple Private Cloud Compute (iOS 27, 27 SDK): availability, quota and the
/// system limit-increase sheet. Generation reuses the adapter's session factory
/// (`model: "pcc"`). Off-device: core only routes here via fallback / explicit provider.
enum ApplePrivateCloudCompute {
  static let provider = "apple-private-cloud-compute"

  /// Written by the config plugin (`privateCloudCompute: true`). A conservative
  /// proxy for the entitlement — UNVERIFIED: confirm on device (no public
  /// entitlement-state API exists).
  static var isConfigured: Bool {
    Bundle.main.object(forInfoDictionaryKey: "ExpoAIPrivateCloudCompute") as? Bool == true
  }

  static func availability() async -> [String: Any] {
    #if canImport(FoundationModels, _version: 2.0)
    guard isConfigured else { return unavailable("entitlement_missing") }
    guard #available(iOS 27.0, macOS 27.0, *) else { return unavailable("unsupported_os_version") }
    let model = PrivateCloudComputeLanguageModel()
    if case .unavailable(let reason) = model.availability {
      switch reason {
      case .deviceNotEligible: return unavailable("unsupported_device")
      case .systemNotReady: return unavailable("model_initializing")
      @unknown default: return unavailable("unknown")
      }
    }
    if model.quotaUsage.isLimitReached { return unavailable("quota_exhausted") }
    var result: [String: Any] = ["available": true, "provider": provider]
    // `try await`: async throws in the 27.1 SDK, sync in 27.0 (only warns there).
    if await (try? model.supportsLocale()) == false {
      result = unavailable("unsupported_locale")
    }
    if let languages = try? await model.supportedLanguages {
      result["supportedLanguages"] = languages.map(\.minimalIdentifier).sorted()
    }
    if let size = try? await model.contextSize { result["contextWindow"] = size }
    return result
    #else
    return unavailable("missing_dependency")
    #endif
  }

  static func quota() -> [String: Any]? {
    #if canImport(FoundationModels, _version: 2.0)
    guard isConfigured, #available(iOS 27.0, macOS 27.0, *) else { return nil }
    let usage = PrivateCloudComputeLanguageModel().quotaUsage
    var isApproachingLimit = false
    if case .belowLimit(let below) = usage.status { isApproachingLimit = below.isApproachingLimit }
    return [
      "status": usage.isLimitReached ? "limit_reached" : "below_limit",
      "isApproachingLimit": isApproachingLimit,
      "resetDate": usage.resetDate.map { $0.timeIntervalSince1970 * 1000 } ?? NSNull(),
      "canRequestLimitIncrease": usage.limitIncreaseSuggestion != nil,
    ]
    #else
    return nil
    #endif
  }

  static func showLimitIncrease() async -> Bool {
    #if canImport(FoundationModels, _version: 2.0)
    guard isConfigured, #available(iOS 27.0, macOS 27.0, *),
          let suggestion = PrivateCloudComputeLanguageModel().quotaUsage.limitIncreaseSuggestion else { return false }
    // UNVERIFIED: confirm on device — `show()` is not `@MainActor` in the SDK, but it presents UI.
    await MainActor.run { suggestion.show() }
    return true
    #else
    return false
    #endif
  }

  private static func unavailable(_ reason: String) -> [String: Any] {
    ["available": false, "provider": provider, "reasonUnavailable": reason]
  }
}
