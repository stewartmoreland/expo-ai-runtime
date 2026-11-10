import Foundation

#if canImport(FoundationModels)
import FoundationModels

/// On-demand activation of prompt-mode skills (`options["skills"]`: `[{name, description, body}]`).
/// One implementation per OS generation behind this seam; `AppleSkills.make` picks it
/// once, when the session is built.
@available(iOS 26.0, macOS 26.0, *)
protocol SkillActivation: Sendable {
  /// Tools the session is built with.
  var tools: [any Tool] { get }
  /// Names activated since the last drain (one response), in order.
  func drainActivated() -> [String]
}

@available(iOS 26.0, macOS 26.0, *)
enum AppleSkills {
  /// `nil` when no skills were sent. iOS 27 `Skills(activations:)` (foundation-models-utilities)
  /// slots in here when Dynamic Profiles land; until then `ToolBackedSkills` serves 26 and 27.
  static func make(_ raw: Any?) throws -> (any SkillActivation)? {
    guard let list = raw as? [[String: Any]], !list.isEmpty else { return nil }
    return try ToolBackedSkills(list)
  }

  /// `result` with `skillsActivated` added when the model activated any.
  static func stamp(_ result: [String: Any], _ skills: (any SkillActivation)?) -> [String: Any] {
    guard let activated = skills?.drainActivated(), !activated.isEmpty else { return result }
    var stamped = result
    stamped["skillsActivated"] = activated
    return stamped
  }
}

/// iOS 26+: one `activate_skill` tool whose output is the skill body, so the body lands
/// in the transcript as a tool output (the same shape as Apple's prompt-mode skills).
@available(iOS 26.0, macOS 26.0, *)
final class ToolBackedSkills: SkillActivation, @unchecked Sendable {
  let tools: [any Tool]
  private let recorder = ActivationRecorder()

  init(_ list: [[String: Any]]) throws {
    var bodies: [String: String] = [:]
    var catalog: [String] = []
    for skill in list {
      guard let name = skill["name"] as? String, let body = skill["body"] as? String else { continue }
      bodies[name] = body
      catalog.append("- \(name): \(skill["description"] as? String ?? "")")
    }
    tools = try [ActivateSkillTool(bodies: bodies, catalog: catalog, recorder: recorder)]
  }

  func drainActivated() -> [String] {
    recorder.drain()
  }
}

/// `NSLock`-guarded: the framework may call the tool off the caller's task.
final class ActivationRecorder: @unchecked Sendable {
  private var names: [String] = []
  private let lock = NSLock()

  func record(_ name: String) {
    lock.lock()
    defer { lock.unlock() }
    if !names.contains(name) {
      names.append(name)
    }
  }

  func drain() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    let drained = names
    names = []
    return drained
  }
}

@available(iOS 26.0, macOS 26.0, *)
struct ActivateSkillTool: Tool {
  let name = "activate_skill"
  let description: String
  let parameters: GenerationSchema
  private let bodies: [String: String]
  private let recorder: ActivationRecorder

  init(bodies: [String: String], catalog: [String], recorder: ActivationRecorder) throws {
    self.bodies = bodies
    self.recorder = recorder
    description = "Load a skill's instructions when the request matches its description. Skills:\n"
      + catalog.joined(separator: "\n")
    // Guided generation keeps `name` to the offered skills.
    let names = DynamicGenerationSchema(name: "SkillName", anyOf: bodies.keys.sorted())
    parameters = try GenerationSchema(
      root: DynamicGenerationSchema(
        name: "ActivateSkill",
        properties: [DynamicGenerationSchema.Property(name: "name", schema: names)]
      ),
      dependencies: []
    )
  }

  func call(arguments: GeneratedContent) async throws -> String {
    let name = try arguments.value(String.self, forProperty: "name")
    guard let body = bodies[name] else { return "Unknown skill \"\(name)\"." }
    recorder.record(name)
    return body
  }
}
#endif
