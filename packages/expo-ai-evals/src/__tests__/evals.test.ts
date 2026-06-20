import { beforeEach, describe, expect, it } from "vitest";

import { clearAdapters, registerAdapter, type JSONSchema } from "@stewmore/expo-ai-core";
import { createMockAdapter } from "@stewmore/expo-ai-core/testing";

import { runEvalSuite, scoreSchemaValidity } from "../index.js";
import { sampleFromSchema } from "../sample.js";

beforeEach(() => clearAdapters());

const schema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" }, age: { type: "integer" } },
  required: ["name", "age"],
};

describe("scoreSchemaValidity + sampleFromSchema", () => {
  it("samples a value that validates against its schema", () => {
    expect(scoreSchemaValidity(sampleFromSchema(schema), schema)).toBe(true);
    expect(scoreSchemaValidity({ name: "x" }, schema)).toBe(false);
  });
});

describe("runEvalSuite", () => {
  it("runs functional + privacy cases against registered adapters", async () => {
    registerAdapter(
      createMockAdapter({
        provider: "apple-foundation-models",
        supportsTasks: true,
        objectText: (req) => JSON.stringify(sampleFromSchema(req.schema)),
      }),
    );

    const suite = await runEvalSuite([
      { name: "sum", kind: "summarize", text: "hello world this is a short note" },
      { name: "extract", kind: "object", prompt: "x", schema },
      { name: "privacy", kind: "privacy", prompt: "secret", fallback: "any" },
    ]);

    expect(suite.total).toBe(3);
    expect(suite.failed).toBe(0);

    const extract = suite.results.find((r) => r.testName === "extract");
    expect(extract?.schemaValid).toBe(true);
    expect(extract?.provider).toBe("apple-foundation-models");

    const privacy = suite.results.find((r) => r.testName === "privacy");
    expect(privacy?.passed).toBe(true);
    expect(privacy?.errorCode).toBe("UNAVAILABLE");
  });
});
