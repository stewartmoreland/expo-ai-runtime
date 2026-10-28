import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Wraps Apple's Foundation Models framework: on-device (iOS 26+) and, with
/// `model: "pcc"`, Private Cloud Compute (iOS 27). Generate paths return errors
/// as values (`{text: "", error}`) so the payload survives the bridge.
///
/// Guards: `#if canImport(FoundationModels)` + `#available(iOS 26)` for the iOS 26
/// API; `#if canImport(FoundationModels, _version: 2.0)` (the 26.4/27 SDKs) for
/// usage, `ContextOptions`, `tokenCount`, `contextSize` and PCC.
enum AppleFoundationModelsAdapter {
  static let provider = "apple-foundation-models"
  static let defaultInstructions = "You are a helpful, concise assistant."

  static func providerName(for model: String?) -> String {
    model == "pcc" ? ApplePrivateCloudCompute.provider : provider
  }

  // MARK: Availability

  static func availability() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      let model = SystemLanguageModel.default
      switch model.availability {
      case .available:
        var result: [String: Any] = [
          "available": true,
          "provider": provider,
          "supportedLanguages": model.supportedLanguages.map(\.minimalIdentifier).sorted(),
        ]
        if !model.supportsLocale(Locale.current) {
          result["available"] = false
          result["reasonUnavailable"] = "unsupported_locale"
        }
        #if canImport(FoundationModels, _version: 2.0)
        // Back-deployed; the SDK itself returns 4096 below iOS 27.
        result["contextWindow"] = model.contextSize
        #endif
        return result
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

  // MARK: Generation (error-as-value)

  static func generate(_ options: [String: Any]) async -> [String: Any] {
    let model = options["model"] as? String
    return await run(options, provider: providerName(for: model)) {
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        let session = try makeSession(model: model, instructions: options["instructions"] as? String)
        return try await respond(session: session, model: model, options: options)
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
    }
  }

  static func generate(inSession id: String, options: [String: Any]) async -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      let entry = AppleSessionStore.shared.entry(for: id)
      // A missing entry falls back to the caller's `model` (the PCC wrapper sends "pcc").
      return await run(options, provider: providerName(for: entry?.model ?? options["model"] as? String)) {
        guard let entry else { throw ExpoAIAppleError.sessionNotFound }
        return try await respond(session: entry.session, model: entry.model, options: options)
      }
    }
    #endif
    return await run(options, provider: providerName(for: options["model"] as? String)) {
      throw ExpoAIAppleError.unsupportedOS
    }
  }

  /// Guided generation: `schemaJson` → `GenerationSchema`; `text` is the JSON string.
  static func generateObject(_ options: [String: Any]) async -> [String: Any] {
    let model = options["model"] as? String
    return await run(options, provider: providerName(for: model)) {
      #if canImport(FoundationModels)
      if #available(iOS 26.0, macOS 26.0, *) {
        let schema = try AppleSchema.convert(
          options["schemaJson"] as? String ?? "",
          rootName: options["schemaName"] as? String ?? "Root"
        )
        let session = try makeSession(model: model, instructions: options["instructions"] as? String)
        let prompt = options["prompt"] as? String ?? ""
        let generationOptions = makeGenerationOptions(options)
        #if canImport(FoundationModels, _version: 2.0)
        if #available(iOS 27.0, macOS 27.0, *) {
          let response = try await session.respond(
            to: prompt,
            schema: schema,
            options: generationOptions,
            contextOptions: contextOptions(options, model: model, includeSchemaInPrompt: true)
          )
          return [
            "text": response.content.jsonString, "finishReason": "stop", "usage": usagePayload(response.usage),
          ]
        }
        #endif
        let response = try await session.respond(
          to: prompt, schema: schema, includeSchemaInPrompt: true, options: generationOptions
        )
        return ["text": response.content.jsonString, "finishReason": "stop"]
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
    }
  }

  /// Runs `work` as a task registered under `requestId` (so `cancel` can reach
  /// it) and maps any error to the payload.
  private static func run(
    _ options: [String: Any],
    provider: String,
    _ work: @escaping () async throws -> [String: Any]
  ) async -> [String: Any] {
    do {
      return try await tracked(options["requestId"] as? String, work)
    } catch {
      return await ["text": "", "error": AppleErrorMapper.payload(for: error, provider: provider)]
    }
  }

  /// `respond` throws `CancellationError` on `Task` cancel on a macOS 27 host.
  /// UNVERIFIED: confirm on device (iOS). If not, JS discards the result and the native work runs on.
  private static func tracked<T>(_ requestId: String?, _ work: @escaping () async throws -> T) async throws -> T {
    let task = Task { try await work() }
    guard let requestId else { return try await task.value }
    AppleTaskRegistry.shared.register(requestId) { task.cancel() }
    defer { AppleTaskRegistry.shared.remove(requestId) }
    return try await task.value
  }
}

// MARK: Streaming

extension AppleFoundationModelsAdapter {
  /// Fire-and-forget: emits `start`, `token` (deltas), then `done` or `error`.
  /// A cancelled stream emits nothing further — the JS side has already settled.
  static func startStreaming(requestId: String, options: [String: Any], emit: @escaping ([String: Any]) -> Void) {
    let model = options["model"] as? String
    Task {
      do {
        try await tracked(requestId) {
          #if canImport(FoundationModels)
          if #available(iOS 26.0, macOS 26.0, *) {
            return try await stream(requestId: requestId, model: model, options: options, emit: emit)
          }
          #endif
          throw ExpoAIAppleError.unsupportedOS
        }
      } catch is CancellationError {
      } catch {
        let payload = await AppleErrorMapper.payload(for: error, provider: providerName(for: model))
        emit(["requestId": requestId, "type": "error", "error": payload])
      }
    }
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, macOS 26.0, *)
  private static func stream(
    requestId: String,
    model: String?,
    options: [String: Any],
    emit: ([String: Any]) -> Void
  ) async throws {
    let session = try makeSession(model: model, instructions: options["instructions"] as? String)
    emit(["requestId": requestId, "type": "start"])

    var last = ""
    var usage: [String: Any]?
    // Foundation Models streams *cumulative* snapshots; emit the delta.
    for try await partial in responseStream(session: session, model: model, options: options) {
      try Task.checkCancellation()
      let snapshot = partial.content
      if snapshot.count >= last.count {
        let delta = String(snapshot.dropFirst(last.count))
        last = snapshot
        if !delta.isEmpty {
          emit(["requestId": requestId, "type": "token", "text": delta])
        }
      }
      #if canImport(FoundationModels, _version: 2.0)
      if #available(iOS 27.0, macOS 27.0, *) {
        usage = usagePayload(partial.usage)
      }
      #endif
    }
    try Task.checkCancellation()

    var result: [String: Any] = ["text": last, "finishReason": "stop"]
    if let usage {
      result["usage"] = usage
    }
    emit(["requestId": requestId, "type": "done", "result": result])
  }

  @available(iOS 26.0, macOS 26.0, *)
  private static func responseStream(
    session: LanguageModelSession,
    model: String?,
    options: [String: Any]
  ) -> LanguageModelSession.ResponseStream<String> {
    let prompt = options["prompt"] as? String ?? ""
    #if canImport(FoundationModels, _version: 2.0)
    if #available(iOS 27.0, macOS 27.0, *) {
      return session.streamResponse(
        to: prompt, options: makeGenerationOptions(options), contextOptions: contextOptions(options, model: model)
      )
    }
    #endif
    return session.streamResponse(to: prompt, options: makeGenerationOptions(options))
  }

  // MARK: Sessions

  /// `model == "pcc"` binds to Private Cloud Compute (27 SDK + iOS 27, else
  /// `unsupportedOS`); anything else is the on-device system model.
  @available(iOS 26.0, macOS 26.0, *)
  static func makeSession(model: String?, instructions: String?) throws -> LanguageModelSession {
    if model == "pcc" {
      #if canImport(FoundationModels, _version: 2.0)
      if #available(iOS 27.0, macOS 27.0, *) {
        return LanguageModelSession(model: PrivateCloudComputeLanguageModel(), tools: [], instructions: instructions)
      }
      #endif
      throw ExpoAIAppleError.unsupportedOS
    }
    return LanguageModelSession(instructions: instructions ?? defaultInstructions)
  }

  @available(iOS 26.0, macOS 26.0, *)
  private static func respond(
    session: LanguageModelSession,
    model: String?,
    options: [String: Any]
  ) async throws -> [String: Any] {
    let prompt = options["prompt"] as? String ?? ""
    #if canImport(FoundationModels, _version: 2.0)
    if #available(iOS 27.0, macOS 27.0, *) {
      let response = try await session.respond(
        to: prompt, options: makeGenerationOptions(options), contextOptions: contextOptions(options, model: model)
      )
      return ["text": response.content, "finishReason": "stop", "usage": usagePayload(response.usage)]
    }
    #endif
    // Below iOS 27 there is no usage; core reports `source: 'unavailable'`.
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

  #if canImport(FoundationModels, _version: 2.0)
  /// `reasoningLevel` applies to PCC only; the on-device model ignores it.
  @available(iOS 27.0, macOS 27.0, *)
  private static func contextOptions(
    _ options: [String: Any],
    model: String?,
    includeSchemaInPrompt: Bool? = nil
  ) -> ContextOptions {
    var level: ContextOptions.ReasoningLevel?
    if model == "pcc" {
      switch options["reasoningLevel"] as? String {
      case "light": level = .light
      case "moderate": level = .moderate
      case "deep": level = .deep
      default: level = nil
      }
    }
    return ContextOptions(includeSchemaInPrompt: includeSchemaInPrompt, reasoningLevel: level)
  }

  @available(iOS 27.0, macOS 27.0, *)
  private static func usagePayload(_ usage: LanguageModelSession.Usage) -> [String: Any] {
    [
      "inputTokens": usage.input.totalTokenCount,
      "outputTokens": usage.output.totalTokenCount,
      "totalTokens": usage.totalTokenCount,
      "cachedInputTokens": usage.input.cachedTokenCount,
      "reasoningTokens": usage.output.reasoningTokenCount,
      "source": "provider",
    ]
  }
  #endif
}

// MARK: Prewarm / tokens

extension AppleFoundationModelsAdapter {
  /// `true` when the target model is available and a session was prewarmed.
  /// UNVERIFIED: confirm on device — the benefit of prewarming a throwaway session
  /// (generate builds a fresh one per call), and what prewarm does for PCC.
  static func prewarm(_ options: [String: Any]) async -> Bool {
    let model = options["model"] as? String
    let info = model == "pcc" ? await ApplePrivateCloudCompute.availability() : availability()
    guard info["available"] as? Bool == true else { return false }
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *),
       let session = try? makeSession(model: model, instructions: options["instructions"] as? String) {
      session.prewarm(promptPrefix: (options["promptPrefix"] as? String).map { Prompt($0) })
      return true
    }
    #endif
    return false
  }

  static func prewarmSession(_ id: String, options: [String: Any]) -> Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *), let entry = AppleSessionStore.shared.entry(for: id) {
      entry.session.prewarm(promptPrefix: (options["promptPrefix"] as? String).map { Prompt($0) })
      return true
    }
    #endif
    return false
  }

  /// `nil` below iOS 26.4 or when built with a pre-26.4/27 SDK.
  static func countTokens(_ text: String) async -> Int? {
    #if canImport(FoundationModels, _version: 2.0)
    if #available(iOS 26.4, macOS 26.4, *) {
      return try? await SystemLanguageModel.default.tokenCount(for: text)
    }
    #endif
    return nil
  }

  static func createSession(_ options: [String: Any]) throws -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      let model = options["model"] as? String
      let id = try AppleSessionStore.shared.create(model: model, instructions: options["instructions"] as? String)
      return ["sessionId": id, "provider": providerName(for: model)]
    }
    #endif
    throw ExpoAIAppleError.unsupportedOS
  }
}

enum ExpoAIAppleError: Error, LocalizedError {
  case unsupportedOS
  case sessionNotFound
  case unsupportedSchema(String)

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "This Apple model is not supported on this OS version or SDK build."
    case .sessionNotFound:
      return "The requested AI session no longer exists."
    case .unsupportedSchema(let keyword):
      return "JSON Schema '\(keyword)' is not supported by Apple guided generation."
    }
  }
}
