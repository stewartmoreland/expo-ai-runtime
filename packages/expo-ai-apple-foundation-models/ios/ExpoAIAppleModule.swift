import ExpoModulesCore

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Expo module exposing primitive Foundation Models operations to JS
/// (docs/prd.md §9, §10). Ergonomics live in the TypeScript adapter.
public final class ExpoAIAppleModule: Module {
  private var streamingTasks: [String: Task<Void, Never>] = [:]

  public func definition() -> ModuleDefinition {
    Name("ExpoAIApple")

    Events("onExpoAIStream")

    AsyncFunction("getAvailability") { () -> [String: Any] in
      AppleFoundationModelsAdapter.availability()
    }

    AsyncFunction("generate") { (options: [String: Any]) async throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        return try await AppleFoundationModelsAdapter.generate(options)
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
    }

    AsyncFunction("createSession") { (options: [String: Any]) throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        let id = AppleSessionStore.shared.create(instructions: options["instructions"] as? String)
        return ["sessionId": id, "provider": AppleFoundationModelsAdapter.provider]
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
    }

    AsyncFunction("generateInSession") { (sessionId: String, options: [String: Any]) async throws -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        return try await AppleFoundationModelsAdapter.generate(inSession: sessionId, options: options)
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
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

    AsyncFunction("startStreaming") { (requestId: String, options: [String: Any]) in
      self.startStreaming(requestId: requestId, options: options)
    }

    AsyncFunction("cancelStreaming") { (requestId: String) in
      self.streamingTasks[requestId]?.cancel()
      self.streamingTasks[requestId] = nil
    }
  }

  private func startStreaming(requestId: String, options: [String: Any]) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      let task = Task { [weak self] in
        guard let self else { return }
        do {
          let session = LanguageModelSession(
            instructions: options["instructions"] as? String
              ?? AppleFoundationModelsAdapter.defaultInstructions
          )
          self.sendEvent("onExpoAIStream", ["requestId": requestId, "type": "start"])

          var last = ""
          let stream = session.streamResponse(
            to: options["prompt"] as? String ?? "",
            options: AppleFoundationModelsAdapter.makeGenerationOptions(options)
          )
          // Foundation Models streams *cumulative* snapshots; emit the delta.
          for try await partial in stream {
            if Task.isCancelled { break }
            let snapshot = partial.content
            if snapshot.count >= last.count {
              let delta = String(snapshot.dropFirst(last.count))
              last = snapshot
              if !delta.isEmpty {
                self.sendEvent("onExpoAIStream", ["requestId": requestId, "type": "token", "text": delta])
              }
            }
          }

          if !Task.isCancelled {
            self.sendEvent("onExpoAIStream", [
              "requestId": requestId,
              "type": "done",
              "result": ["text": last, "finishReason": "stop"],
            ])
          }
        } catch {
          self.sendEvent("onExpoAIStream", [
            "requestId": requestId,
            "type": "error",
            "error": AppleErrorMapper.payload(for: error),
          ])
        }
        self.streamingTasks[requestId] = nil
      }
      self.streamingTasks[requestId] = task
      return
    }
    #endif

    self.sendEvent("onExpoAIStream", [
      "requestId": requestId,
      "type": "error",
      "error": [
        "code": "UNSUPPORTED_DEVICE",
        "provider": AppleFoundationModelsAdapter.provider,
        "message": "Apple Foundation Models requires iOS 26+",
      ],
    ])
  }
}
