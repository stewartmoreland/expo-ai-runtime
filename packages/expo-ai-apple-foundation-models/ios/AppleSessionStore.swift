import Foundation

#if canImport(FoundationModels)
import FoundationModels

/// Thread-safe store of native `LanguageModelSession`s keyed by a JS-visible id.
/// Retains the model + instructions so a session can be reset (the framework
/// has no in-place transcript clear — reset rebuilds the session, PCC included).
@available(iOS 26.0, macOS 26.0, *)
final class AppleSessionStore {
  static let shared = AppleSessionStore()

  struct Entry {
    var session: LanguageModelSession
    let model: String?
    let instructions: String?
  }

  private var entries: [String: Entry] = [:]
  private let queue = DispatchQueue(label: "expo.modules.ai.apple.sessions")

  func create(model: String?, instructions: String?) throws -> String {
    let session = try AppleFoundationModelsAdapter.makeSession(model: model, instructions: instructions)
    let id = UUID().uuidString
    queue.sync {
      entries[id] = Entry(session: session, model: model, instructions: instructions)
    }
    return id
  }

  func entry(for id: String) -> Entry? {
    queue.sync { entries[id] }
  }

  func reset(_ id: String) {
    queue.sync {
      guard let entry = entries[id],
            let session = try? AppleFoundationModelsAdapter.makeSession(
              model: entry.model, instructions: entry.instructions
            ) else { return }
      entries[id]?.session = session
    }
  }

  func dispose(_ id: String) {
    queue.sync {
      entries[id] = nil
    }
  }
}
#endif

/// Cancellers for in-flight generate/object/session/stream tasks, keyed by the
/// JS `requestId`. A cancel that arrives before `register` is remembered so it
/// still wins. `NSLock`-guarded: called from JS threads and from the tasks.
final class AppleTaskRegistry {
  static let shared = AppleTaskRegistry()

  private var cancellers: [String: () -> Void] = [:]
  // ponytail: ids cancelled after completion are never registered, so they stay
  // here forever (a few bytes each); add expiry if JS ever cancels settled ids in bulk.
  private var cancelledEarly: Set<String> = []
  private let lock = NSLock()

  func register(_ id: String, cancel: @escaping () -> Void) {
    lock.lock()
    let early = cancelledEarly.remove(id) != nil
    if !early { cancellers[id] = cancel }
    lock.unlock()
    if early { cancel() }
  }

  func remove(_ id: String) {
    lock.lock()
    cancellers[id] = nil
    lock.unlock()
  }

  func cancel(_ id: String) {
    lock.lock()
    let canceller = cancellers.removeValue(forKey: id)
    if canceller == nil { cancelledEarly.insert(id) }
    lock.unlock()
    canceller?()
  }
}
