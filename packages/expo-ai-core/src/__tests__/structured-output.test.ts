import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ExpoAI,
  clearAdapters,
  extractJson,
  registerAdapter,
  validateAgainstSchema,
  type JSONSchema,
} from "../index.js";
import { createMockAdapter } from "../testing.js";

const personSchema: JSONSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "integer", minimum: 0 },
    tags: { type: "array", items: { type: "string" }, minItems: 1 },
  },
  required: ["name", "age"],
};

describe("validateAgainstSchema", () => {
  it("accepts a conforming object", () => {
    const result = validateAgainstSchema({ name: "Ada", age: 36, tags: ["math"] }, personSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports a missing required property", () => {
    const result = validateAgainstSchema({ name: "Ada" }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("age");
  });

  it("reports a type mismatch", () => {
    const result = validateAgainstSchema({ name: "Ada", age: "old" }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("expected type integer");
  });

  it("enforces numeric minimum", () => {
    const result = validateAgainstSchema({ name: "Ada", age: -1 }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(">= 0");
  });

  it("enforces array minItems and item types", () => {
    const result = validateAgainstSchema({ name: "Ada", age: 1, tags: [] }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("at least 1 items");
  });

  it("treats an integer as a valid number", () => {
    const schema: JSONSchema = { type: "object", properties: { x: { type: "number" } }, required: ["x"] };
    expect(validateAgainstSchema({ x: 5 }, schema).valid).toBe(true);
  });

  it("enforces enum membership", () => {
    const schema: JSONSchema = { type: "string", enum: ["a", "b"] };
    expect(validateAgainstSchema("a", schema).valid).toBe(true);
    expect(validateAgainstSchema("z", schema).valid).toBe(false);
  });

  it("rejects a non-object value for a typeless object-shaped schema", () => {
    const objSchema: JSONSchema = { properties: { a: { type: "string" } }, required: ["a"] };
    expect(validateAgainstSchema("hello", objSchema).valid).toBe(false);
    expect(validateAgainstSchema(42, objSchema).valid).toBe(false);
    expect(validateAgainstSchema({ a: "x" }, objSchema).valid).toBe(true);
  });
});

describe("extractJson", () => {
  it("pulls JSON out of a ```json fence", () => {
    const text = 'Sure!\n```json\n{"a":1}\n```\nHope that helps.';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it("finds the first balanced object in noisy text", () => {
    expect(extractJson('prefix {"a": {"b": 2}} suffix')).toBe('{"a": {"b": 2}}');
  });

  it("ignores braces inside strings", () => {
    expect(extractJson('{"s": "a } b"}')).toBe('{"s": "a } b"}');
  });

  it("returns null when there is no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
  });

  it("finds JSON in a later fence when the first fence is not JSON", () => {
    expect(extractJson("```\nnot json\n```\n```json\n{\"x\":1}\n```")).toBe('{"x":1}');
  });

  it("finds JSON outside a fence even when an earlier fence has none", () => {
    expect(extractJson('Here is code:\n```\nprint("{")\n```\nResult: {"answer": 42}')).toBe(
      '{"answer": 42}',
    );
  });

  it("keeps JSON whose string value contains a code fence", () => {
    const text = '```json\n{"code": "```py\\nx=1\\n```"}\n```';
    const extracted = extractJson(text);
    expect(extracted).not.toBeNull();
    expect(JSON.parse(extracted as string)).toEqual({ code: "```py\nx=1\n```" });
  });
});

describe("ExpoAI.generateObject (validate → repair)", () => {
  beforeEach(() => clearAdapters());

  it("returns a parsed object from valid JSON text", async () => {
    registerAdapter(
      createMockAdapter({
        provider: "cloud",
        respondWith: '{"name":"Ada","age":36,"tags":["math"]}',
      }),
    );
    const obj = await ExpoAI.generateObject({
      prompt: "extract",
      schema: personSchema,
      fallback: "cloud",
      provider: "cloud",
    });
    expect(obj).toEqual({ name: "Ada", age: 36, tags: ["math"] });
  });

  it("uses native guided generation (generateObject) when present", async () => {
    registerAdapter(
      createMockAdapter({
        provider: "apple-foundation-models",
        objectText: '{"name":"Grace","age":85}',
        respondWith: "SHOULD NOT BE USED",
      }),
    );
    const obj = await ExpoAI.generateObject({ prompt: "extract", schema: personSchema });
    expect(obj).toEqual({ name: "Grace", age: 85 });
  });

  it("repairs invalid output by re-prompting with the validation errors", async () => {
    const replies = ['{"name":"Ada"}', '{"name":"Ada","age":36}'];
    const respondWith = vi.fn(() => replies.shift() ?? "{}");
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith }));

    const obj = await ExpoAI.generateObject({
      prompt: "extract",
      schema: personSchema,
      provider: "cloud",
      maxRepairAttempts: 2,
    });

    expect(obj).toEqual({ name: "Ada", age: 36 });
    expect(respondWith).toHaveBeenCalledTimes(2);
    // The second (repair) prompt should reference the missing field.
    expect(respondWith.mock.calls[1]?.[0]).toContain("age");
  });

  it("throws when output never satisfies the schema", async () => {
    registerAdapter(createMockAdapter({ provider: "cloud", respondWith: '{"nope":true}' }));
    await expect(
      ExpoAI.generateObject({
        prompt: "extract",
        schema: personSchema,
        provider: "cloud",
        maxRepairAttempts: 1,
      }),
    ).rejects.toBeTruthy();
  });

  it("recovers JSON that follows a stray brace, with no repair attempt", async () => {
    registerAdapter(
      createMockAdapter({ provider: "cloud", respondWith: 'Result {ok}: {"name":"Ada","age":36}' }),
    );
    const obj = await ExpoAI.generateObject({
      prompt: "extract",
      schema: personSchema,
      provider: "cloud",
      maxRepairAttempts: 0,
    });
    expect(obj).toEqual({ name: "Ada", age: 36 });
  });
});
