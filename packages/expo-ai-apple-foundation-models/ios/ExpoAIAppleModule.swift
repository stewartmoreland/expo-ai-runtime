import ExpoModulesCore

/// Expo module exposing primitive Foundation Models operations to JS
/// (docs/prd.md §9, §10). Ergonomics live in the TypeScript adapter; the
/// FoundationModels work lives in the adapter/PCC helpers so this stays thin.
public final class ExpoAIAppleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoAIApple")

    Events("onExpoAIStream")

    AsyncFunction("getAvailability") { () -> [String: Any] in
      AppleFoundationModelsAdapter.availability()
    }

    AsyncFunction("generate") { (options: [String: Any]) async -> [String: Any] in
      await AppleFoundationModelsAdapter.generate(options)
    }

    AsyncFunction("generateObject") { (options: [String: Any]) async -> [String: Any] in
      await AppleFoundationModelsAdapter.generateObject(options)
    }

    AsyncFunction("createSession") { (options: [String: Any]) throws -> [String: Any] in
      try AppleFoundationModelsAdapter.createSession(options)
    }

    AsyncFunction("generateInSession") { (sessionId: String, options: [String: Any]) async -> [String: Any] in
      await AppleFoundationModelsAdapter.generate(inSession: sessionId, options: options)
    }

    AsyncFunction("resetSession") { (sessionId: String) in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        AppleSessionStore.shared.reset(sessionId)
      }
      #endif
    }

    AsyncFunction("disposeSession") { (sessionId: String) in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        AppleSessionStore.shared.dispose(sessionId)
      }
      #endif
    }

    AsyncFunction("startStreaming") { [weak self] (requestId: String, options: [String: Any]) in
      AppleFoundationModelsAdapter.startStreaming(requestId: requestId, options: options) { event in
        self?.sendEvent("onExpoAIStream", event)
      }
    }

    AsyncFunction("cancelStreaming") { (requestId: String) in
      AppleTaskRegistry.shared.cancel(requestId)
    }

    AsyncFunction("cancel") { (requestId: String) in
      AppleTaskRegistry.shared.cancel(requestId)
    }

    AsyncFunction("prewarm") { (options: [String: Any]) async -> Bool in
      await AppleFoundationModelsAdapter.prewarm(options)
    }

    AsyncFunction("prewarmSession") { (sessionId: String, options: [String: Any]) -> Bool in
      AppleFoundationModelsAdapter.prewarmSession(sessionId, options: options)
    }

    AsyncFunction("countTokens") { (text: String) async -> Int? in
      await AppleFoundationModelsAdapter.countTokens(text)
    }

    AsyncFunction("getPCCAvailability") { () async -> [String: Any] in
      await ApplePrivateCloudCompute.availability()
    }

    AsyncFunction("getPCCQuota") { () -> [String: Any]? in
      ApplePrivateCloudCompute.quota()
    }

    AsyncFunction("showPCCLimitIncrease") { () async -> Bool in
      await ApplePrivateCloudCompute.showLimitIncrease()
    }
  }
}
