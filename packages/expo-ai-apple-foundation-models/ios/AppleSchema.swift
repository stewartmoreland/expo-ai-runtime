import Foundation

#if canImport(FoundationModels)
import FoundationModels

/// Converts the JSON Schema subset Apple guided generation can honour into a
/// `GenerationSchema`. The denylisted keywords below (and bad `type` / `enum` /
/// `additionalProperties`) throw `unsupportedSchema` (→ `UNSUPPORTED_SCHEMA`), and
/// core's `'auto'` mode retries emulated. Other unknown keywords are ignored.
@available(iOS 26.0, macOS 26.0, *)
enum AppleSchema {
  static let unsupportedKeywords = [
    "$ref", "anyOf", "oneOf", "allOf", "nullable", "const", "pattern", "format",
    "minLength", "maxLength", "multipleOf", "exclusiveMinimum", "exclusiveMaximum",
    "uniqueItems", "patternProperties",
  ]

  static func convert(_ json: String, rootName: String) throws -> GenerationSchema {
    guard let data = json.data(using: .utf8),
          let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      throw ExpoAIAppleError.unsupportedSchema("schemaJson")
    }
    guard root["type"] as? String == "object" else { throw ExpoAIAppleError.unsupportedSchema("type") }
    return try GenerationSchema(root: node(root, path: rootName), dependencies: [])
  }

  // Named schemas (objects, enums) use their path (`Root.address`) so
  // `SchemaError.duplicateType` cannot fire.
  // swiftlint:disable:next cyclomatic_complexity
  private static func node(_ schema: [String: Any], path: String) throws -> DynamicGenerationSchema {
    if let keyword = unsupportedKeywords.first(where: { schema[$0] != nil }) {
      throw ExpoAIAppleError.unsupportedSchema(keyword)
    }
    if let extra = schema["additionalProperties"], extra as? Bool != false {
      throw ExpoAIAppleError.unsupportedSchema("additionalProperties")
    }
    // Type arrays (`["string", "null"]`) fail this cast too.
    guard let type = schema["type"] as? String else { throw ExpoAIAppleError.unsupportedSchema("type") }
    let enumValues = schema["enum"] as? [String]
    if schema["enum"] != nil, enumValues == nil || type != "string" {
      throw ExpoAIAppleError.unsupportedSchema("enum")
    }
    let description = schema["description"] as? String

    switch type {
    case "object":
      let properties = schema["properties"] as? [String: Any] ?? [:]
      let required = schema["required"] as? [String] ?? []
      // ponytail: JSONSerialization drops key order, so properties follow `required`
      // order (zod emits declaration order), then the optional ones alphabetically.
      let keys = required.filter { properties[$0] != nil }
        + properties.keys.filter { !required.contains($0) }.sorted()
      return try DynamicGenerationSchema(name: path, description: description, properties: keys.map { key in
        guard let child = properties[key] as? [String: Any] else { throw ExpoAIAppleError.unsupportedSchema(key) }
        return try DynamicGenerationSchema.Property(
          name: key,
          description: child["description"] as? String,
          schema: node(child, path: "\(path).\(key)"),
          isOptional: !required.contains(key)
        )
      })
    case "string":
      if let values = enumValues {
        return DynamicGenerationSchema(name: path, description: description, anyOf: values)
      }
      return DynamicGenerationSchema(type: String.self)
    case "integer":
      var guides: [GenerationGuide<Int>] = []
      if let min = schema["minimum"] as? Int {
        guides.append(.minimum(min))
      }
      if let max = schema["maximum"] as? Int {
        guides.append(.maximum(max))
      }
      return DynamicGenerationSchema(type: Int.self, guides: guides)
    case "number":
      var guides: [GenerationGuide<Double>] = []
      if let min = schema["minimum"] as? Double {
        guides.append(.minimum(min))
      }
      if let max = schema["maximum"] as? Double {
        guides.append(.maximum(max))
      }
      return DynamicGenerationSchema(type: Double.self, guides: guides)
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self)
    case "array":
      guard let items = schema["items"] as? [String: Any] else { throw ExpoAIAppleError.unsupportedSchema("items") }
      return try DynamicGenerationSchema(
        arrayOf: node(items, path: path),
        minimumElements: schema["minItems"] as? Int,
        maximumElements: schema["maxItems"] as? Int
      )
    default:
      throw ExpoAIAppleError.unsupportedSchema("type")
    }
  }
}
#endif
