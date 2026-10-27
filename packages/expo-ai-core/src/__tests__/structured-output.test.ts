import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ExpoAI,
  ExpoAIError,
  clearAdapters,
  extractJson,
  generateValidatedObject,
  registerAdapter,
  validateAgainstSchema,
  type JSONSchema,
} from '../index.js';
import { createMockAdapter, resetPrivacyPolicy } from '../testing.js';

afterEach(() => resetPrivacyPolicy());

const personSchema: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
  required: ['name', 'age'],
};

describe('validateAgainstSchema', () => {
  it('accepts a conforming object', () => {
    const result = validateAgainstSchema({ name: 'Ada', age: 36, tags: ['math'] }, personSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports a missing required property', () => {
    const result = validateAgainstSchema({ name: 'Ada' }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('age');
  });

  it('reports a type mismatch', () => {
    const result = validateAgainstSchema({ name: 'Ada', age: 'old' }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('expected type integer');
  });

  it('enforces numeric minimum', () => {
    const result = validateAgainstSchema({ name: 'Ada', age: -1 }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('>= 0');
  });

  it('enforces array minItems and item types', () => {
    const result = validateAgainstSchema({ name: 'Ada', age: 1, tags: [] }, personSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('at least 1 items');
  });

  it('treats an integer as a valid number', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { x: { type: 'number' } },
      required: ['x'],
    };
    expect(validateAgainstSchema({ x: 5 }, schema).valid).toBe(true);
  });

  it('enforces enum membership', () => {
    const schema: JSONSchema = { type: 'string', enum: ['a', 'b'] };
    expect(validateAgainstSchema('a', schema).valid).toBe(true);
    expect(validateAgainstSchema('z', schema).valid).toBe(false);
  });

  it('rejects a non-object value for a typeless object-shaped schema', () => {
    const objSchema: JSONSchema = { properties: { a: { type: 'string' } }, required: ['a'] };
    expect(validateAgainstSchema('hello', objSchema).valid).toBe(false);
    expect(validateAgainstSchema(42, objSchema).valid).toBe(false);
    expect(validateAgainstSchema({ a: 'x' }, objSchema).valid).toBe(true);
  });
});

describe('extractJson', () => {
  it('pulls JSON out of a ```json fence', () => {
    const text = 'Sure!\n```json\n{"a":1}\n```\nHope that helps.';
    expect(extractJson(text)).toBe('{"a":1}');
  });

  it('finds the first balanced object in noisy text', () => {
    expect(extractJson('prefix {"a": {"b": 2}} suffix')).toBe('{"a": {"b": 2}}');
  });

  it('ignores braces inside strings', () => {
    expect(extractJson('{"s": "a } b"}')).toBe('{"s": "a } b"}');
  });

  it('returns null when there is no JSON', () => {
    expect(extractJson('no json here')).toBeNull();
  });

  it('finds JSON in a later fence when the first fence is not JSON', () => {
    expect(extractJson('```\nnot json\n```\n```json\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('finds JSON outside a fence even when an earlier fence has none', () => {
    expect(extractJson('Here is code:\n```\nprint("{")\n```\nResult: {"answer": 42}')).toBe(
      '{"answer": 42}',
    );
  });

  it('keeps JSON whose string value contains a code fence', () => {
    const text = '```json\n{"code": "```py\\nx=1\\n```"}\n```';
    const extracted = extractJson(text);
    expect(extracted).not.toBeNull();
    expect(JSON.parse(extracted as string)).toEqual({ code: '```py\nx=1\n```' });
  });
});

describe('ExpoAI.generateObject (validate → repair)', () => {
  beforeEach(() => clearAdapters());

  it('returns a parsed object from valid JSON text', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'cloud',
        respondWith: '{"name":"Ada","age":36,"tags":["math"]}',
      }),
    );
    const obj = await ExpoAI.generateObject({
      prompt: 'extract',
      schema: personSchema,
      fallback: 'cloud',
      provider: 'cloud',
    });
    expect(obj).toEqual({ name: 'Ada', age: 36, tags: ['math'] });
  });

  it('uses native guided generation (generateObject) when present', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        objectText: '{"name":"Grace","age":85}',
        respondWith: 'SHOULD NOT BE USED',
      }),
    );
    const obj = await ExpoAI.generateObject({ prompt: 'extract', schema: personSchema });
    expect(obj).toEqual({ name: 'Grace', age: 85 });
  });

  it('repairs invalid output by re-prompting with the validation errors', async () => {
    const replies = ['{"name":"Ada"}', '{"name":"Ada","age":36}'];
    const respondWith = vi.fn(() => replies.shift() ?? '{}');
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith }));

    const obj = await ExpoAI.generateObject({
      prompt: 'extract',
      schema: personSchema,
      provider: 'cloud',
      maxRepairAttempts: 2,
    });

    expect(obj).toEqual({ name: 'Ada', age: 36 });
    expect(respondWith).toHaveBeenCalledTimes(2);
    // The second (repair) prompt should reference the missing field.
    expect((respondWith.mock.calls[1] as unknown[] | undefined)?.[0]).toContain('age');
  });

  it('throws when output never satisfies the schema', async () => {
    registerAdapter(createMockAdapter({ provider: 'cloud', respondWith: '{"nope":true}' }));
    await expect(
      ExpoAI.generateObject({
        prompt: 'extract',
        schema: personSchema,
        provider: 'cloud',
        maxRepairAttempts: 1,
      }),
    ).rejects.toBeTruthy();
  });

  it('recovers JSON that follows a stray brace, with no repair attempt', async () => {
    registerAdapter(
      createMockAdapter({ provider: 'cloud', respondWith: 'Result {ok}: {"name":"Ada","age":36}' }),
    );
    const obj = await ExpoAI.generateObject({
      prompt: 'extract',
      schema: personSchema,
      provider: 'cloud',
      maxRepairAttempts: 0,
    });
    expect(obj).toEqual({ name: 'Ada', age: 36 });
  });
});

describe('structured output modes', () => {
  beforeEach(() => clearAdapters());

  const person = '{"name":"Ada","age":36}';

  it("'emulated' never calls native generation", async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        objectText: 'NOT JSON',
        respondWith: person,
      }),
    );
    const { result } = await ExpoAI.generateObjectWithMeta({
      prompt: 'extract',
      schema: personSchema,
      structuredOutput: 'emulated',
    });
    expect(result.structured).toEqual({ mode: 'emulated', attempts: 1, usedRepair: false });
  });

  it("'native' falls back to the next provider when one lacks native generation", async () => {
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: person }),
    );
    registerAdapter(
      createMockAdapter({ provider: 'android-aicore-gemini-nano', objectText: person }),
    );
    const { result } = await ExpoAI.generateObjectWithMeta({
      prompt: 'extract',
      schema: personSchema,
      structuredOutput: 'native',
    });
    expect(result.provider).toBe('android-aicore-gemini-nano');
    expect(result.structured?.mode).toBe('native');
  });

  it("'native' rejects with UNSUPPORTED_SCHEMA when no provider has native generation", async () => {
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: person }),
    );
    await expect(
      ExpoAI.generateObject({ prompt: 'x', schema: personSchema, structuredOutput: 'native' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' });
  });

  it("'auto' retries attempt 0 emulated when native throws UNSUPPORTED_SCHEMA", async () => {
    const validated = await generateValidatedObject({
      provider: 'apple-foundation-models',
      schema: personSchema,
      basePrompt: 'extract',
      nativeObject: () =>
        Promise.reject(
          new ExpoAIError({ code: 'UNSUPPORTED_SCHEMA', provider: 'apple-foundation-models' }),
        ),
      generateText: async () => person,
    });
    expect(validated).toMatchObject({ mode: 'emulated', attempts: 1, usedRepair: false });
  });

  it("'native' propagates UNSUPPORTED_SCHEMA from native generation", async () => {
    await expect(
      generateValidatedObject({
        provider: 'apple-foundation-models',
        schema: personSchema,
        basePrompt: 'extract',
        mode: 'native',
        nativeObject: () => Promise.reject({ code: 'UNSUPPORTED_SCHEMA' }),
        generateText: async () => person,
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' });
  });

  it('sums usage across attempts; partial counts become unavailable', async () => {
    const replies = [
      { text: '{"name":"Ada"}', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
      { text: person, usage: { inputTokens: 4, outputTokens: 1 } },
    ];
    const summed = await generateValidatedObject({
      provider: 'cloud',
      schema: personSchema,
      basePrompt: 'extract',
      generateText: async () => replies.shift()!,
    });
    // totalTokens is dropped: only one attempt reported it.
    expect(summed.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
    expect(summed.usedRepair).toBe(true);

    const texts = [{ text: '{"name":"Ada"}', usage: { inputTokens: 3 } }, person];
    const partial = await generateValidatedObject({
      provider: 'cloud',
      schema: personSchema,
      basePrompt: 'extract',
      generateText: async () => texts.shift()!,
    });
    expect(partial.usage).toEqual({ source: 'unavailable' });
  });

  it('stamps usage on generateObjectWithMeta results', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'apple-foundation-models',
        respondWith: person,
        usage: { inputTokens: 2, outputTokens: 3, source: 'estimated' },
      }),
    );
    const { result } = await ExpoAI.generateObjectWithMeta({ prompt: 'x', schema: personSchema });
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 3, source: 'estimated' });

    clearAdapters();
    registerAdapter(
      createMockAdapter({ provider: 'apple-foundation-models', respondWith: person }),
    );
    const bare = await ExpoAI.generateObjectWithMeta({ prompt: 'x', schema: personSchema });
    expect(bare.result.usage).toEqual({ source: 'unavailable' });
  });
});
