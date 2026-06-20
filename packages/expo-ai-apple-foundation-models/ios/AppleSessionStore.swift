import Foundation

#if canImport(FoundationModels)
import FoundationModels

/// Thread-safe store of native `LanguageModelSession`s keyed by a JS-visible id.
/// Retains the original instructions so a session can be reset (the framework
/// has no in-place transcript clear — reset rebuilds the session).
@available(iOS 26.0, macOS 26.0, *)
final class AppleSessionStore {
  static let shared = AppleSessionStore()

  private var sessions: [String: LanguageModelSession] = [:]
  private var instructions: [String: String] = [:]
  private let queue = DispatchQueue(label: "expo.modules.ai.apple.sessions")

  func create(instructions instr: String?) -> String {
    let id = UUID().uuidString
    queue.sync {
      sessions[id] = makeSession(instr)
      if let instr { instructions[id] = instr }
    }
    return id
  }

  func session(for id: String) -> LanguageModelSession? {
    queue.sync { sessions[id] }
  }

  func reset(_ id: String) {
    queue.sync {
      sessions[id] = makeSession(instructions[id])
    }
  }

  func dispose(_ id: String) {
    queue.sync {
      sessions[id] = nil
      instructions[id] = nil
    }
  }

  private func makeSession(_ instr: String?) -> LanguageModelSession {
    if let instr {
      return LanguageModelSession(instructions: instr)
    }
    return LanguageModelSession()
  }
}
#endif
