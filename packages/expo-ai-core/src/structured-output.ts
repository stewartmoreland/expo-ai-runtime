/**
 * Structured output (docs/prd.md §15).
 *
 * A dependency-free JSON Schema *subset* validator plus a validate→repair loop.
 * Providers that do native guided generation (Apple) supply already-valid JSON
 * and skip repair; providers that don't (Android, cloud) get prompt-engineered
 * JSON which is validated and, on failure, re-prompted with the errors.
 */

import { ExpoAIError } from './errors.js';
import type { ExpoAIProvider, JSONSchema, JSONSchemaType } from './types.js';

export type ValidationResult = { valid: boolean; errors: string[] };

/** Validate a parsed value against the supported JSON Schema subset. */
export function validateAgainstSchema(value: unknown, schema: JSONSchema): ValidationResult {
  const errors: string[] = [];
  validateNode(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

function typeOf(value: unknown): JSONSchemaType | 'undefined' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'object':
      return 'object';
    default:
      return 'undefined';
  }
}

function matchesType(actual: JSONSchemaType | 'undefined', expected: JSONSchemaType): boolean {
  if (actual === expected) return true;
  // an integer satisfies "number"
  if (expected === 'number' && actual === 'integer') return true;
  return false;
}

function validateNode(value: unknown, schema: JSONSchema, path: string, errors: string[]): void {
  if (schema.enum !== undefined) {
    const ok = schema.enum.some((candidate) => deepEqual(candidate, value));
    if (!ok) {
      errors.push(`${path}: value is not one of the allowed enum values`);
    }
  }

  if (schema.type !== undefined) {
    const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = expectedTypes.some((t) => matchesType(actual, t));
    if (!ok) {
      errors.push(`${path}: expected type ${expectedTypes.join(' | ')} but got ${actual}`);
      return; // further checks assume the type matched
    }

    if (expectedTypes.includes('object') && actual === 'object') {
      validateObject(value as Record<string, unknown>, schema, path, errors);
    }
    if (expectedTypes.includes('array') && actual === 'array') {
      validateArray(value as unknown[], schema, path, errors);
    }
    if (
      (expectedTypes.includes('number') || expectedTypes.includes('integer')) &&
      (actual === 'number' || actual === 'integer')
    ) {
      validateNumber(value as number, schema, path, errors);
    }
    if (expectedTypes.includes('string') && actual === 'string') {
      validateString(value as string, schema, path, errors);
    }
  } else if (schema.properties || schema.required) {
    // No explicit type, but object-shaped keywords present: require an object.
    if (typeOf(value) === 'object') {
      validateObject(value as Record<string, unknown>, schema, path, errors);
    } else {
      errors.push(`${path}: expected type object but got ${typeOf(value)}`);
    }
  }
}

function validateObject(
  value: Record<string, unknown>,
  schema: JSONSchema,
  path: string,
  errors: string[],
): void {
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in value) || value[key] === undefined) {
        errors.push(`${path}.${key}: required property is missing`);
      }
    }
  }
  if (schema.properties) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value && value[key] !== undefined) {
        validateNode(value[key], childSchema, `${path}.${key}`, errors);
      }
    }
  }
}

function validateArray(value: unknown[], schema: JSONSchema, path: string, errors: string[]): void {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path}: expected at least ${schema.minItems} items but got ${value.length}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(`${path}: expected at most ${schema.maxItems} items but got ${value.length}`);
  }
  if (schema.items) {
    value.forEach((item, index) => {
      validateNode(item, schema.items as JSONSchema, `${path}[${index}]`, errors);
    });
  }
}

function validateNumber(value: number, schema: JSONSchema, path: string, errors: string[]): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: expected >= ${schema.minimum} but got ${value}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(`${path}: expected <= ${schema.maximum} but got ${value}`);
  }
}

function validateString(value: string, schema: JSONSchema, path: string, errors: string[]): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path}: expected length >= ${schema.minLength} but got ${value.length}`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path}: expected length <= ${schema.maxLength} but got ${value.length}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* JSON extraction + parsing                                          */
/* ------------------------------------------------------------------ */

/** Find the matching close index for the bracket at `start` (string-aware). */
function matchBalanced(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every top-level balanced object/array span in `text`, in order (string-aware). */
function balancedSpans(text: string): string[] {
  const spans: string[] = [];
  let i = 0;
  let inString = false;
  let escaped = false;
  while (i < text.length) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      i += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      i += 1;
      continue;
    }
    if (char === '{' || char === '[') {
      const end = matchBalanced(text, i);
      if (end !== -1) {
        spans.push(text.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    i += 1;
  }
  return spans;
}

/**
 * JSON-looking substrings of model text, most-specific first: the body of each
 * ```fenced``` block, then every balanced object/array span found by scanning the
 * whole text. Scanning the raw text (string-aware) means JSON in a *later* fence,
 * *outside* a fence, or one whose string value *contains* a fence is still found
 * even when the leading fence is non-JSON. Deduped, order-preserving.
 */
export function collectJsonLike(text: string): string[] {
  const candidates: string[] = [];
  const trimmed = text.trim();

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(trimmed)) !== null) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
  }

  for (const span of balancedSpans(trimmed)) candidates.push(span);

  return [...new Set(candidates)];
}

/** The most likely single JSON string in model text, or null. */
export function extractJson(text: string): string | null {
  const candidates = collectJsonLike(text);
  for (const candidate of candidates) {
    if (parseJson(candidate).ok) return candidate;
  }
  return candidates[0] ?? null;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export function parseJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `not valid JSON: ${(error as Error).message}` };
  }
}

/* ------------------------------------------------------------------ */
/* Prompt construction                                                */
/* ------------------------------------------------------------------ */

export function buildSchemaPrompt(
  basePrompt: string,
  schema: JSONSchema,
  schemaName?: string,
): string {
  const name = schemaName ? ` named "${schemaName}"` : '';
  return [
    `${basePrompt}`,
    '',
    `Respond with ONLY a single JSON value${name} that conforms to this JSON Schema.`,
    'Do not include any explanation, comments, or Markdown code fences.',
    '',
    'JSON Schema:',
    JSON.stringify(schema, null, 2),
  ].join('\n');
}

export function buildRepairPrompt(
  basePrompt: string,
  schema: JSONSchema,
  previousOutput: string,
  errors: string[],
  schemaName?: string,
): string {
  return [
    buildSchemaPrompt(basePrompt, schema, schemaName),
    '',
    'Your previous response did not satisfy the schema.',
    'Previous response:',
    previousOutput,
    '',
    'Validation errors:',
    ...errors.map((error) => `- ${error}`),
    '',
    'Return a corrected JSON value that fixes every error above.',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Validate → repair orchestration                                    */
/* ------------------------------------------------------------------ */

export type GenerateValidatedObjectOptions = {
  provider: ExpoAIProvider;
  schema: JSONSchema;
  basePrompt: string;
  schemaName?: string;
  maxRepairAttempts?: number;
  /** Run one text generation for the given prompt. */
  generateText: (prompt: string) => Promise<string>;
  /** Optional native guided generation that returns JSON text for the schema. */
  nativeObject?: () => Promise<string>;
};

export type ValidatedObjectResult = {
  object: unknown;
  raw: string;
  attempts: number;
  usedRepair: boolean;
};

export async function generateValidatedObject(
  options: GenerateValidatedObjectOptions,
): Promise<ValidatedObjectResult> {
  const maxRepair = options.maxRepairAttempts ?? 2;
  let lastErrors: string[] = [];
  let lastText = '';
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    attempts++;
    let text: string;
    if (attempt === 0 && options.nativeObject) {
      text = await options.nativeObject();
    } else if (attempt === 0) {
      text = await options.generateText(
        buildSchemaPrompt(options.basePrompt, options.schema, options.schemaName),
      );
    } else {
      text = await options.generateText(
        buildRepairPrompt(
          options.basePrompt,
          options.schema,
          lastText,
          lastErrors,
          options.schemaName,
        ),
      );
    }
    lastText = text;

    // Try every JSON-looking candidate (fenced blocks, balanced spans, raw text)
    // and accept the first that both parses and satisfies the schema.
    const candidates = [...collectJsonLike(text), text.trim()];
    let firstParseErrors: string[] | null = null;
    for (const candidate of candidates) {
      const parsed = parseJson(candidate);
      if (!parsed.ok) continue;
      const validation = validateAgainstSchema(parsed.value, options.schema);
      if (validation.valid) {
        return { object: parsed.value, raw: text, attempts, usedRepair: attempt > 0 };
      }
      if (firstParseErrors === null) firstParseErrors = validation.errors;
    }
    lastErrors = firstParseErrors ?? ['response did not contain valid JSON matching the schema'];
  }

  throw new ExpoAIError({
    code: 'NATIVE_PROVIDER_ERROR',
    provider: options.provider,
    message: `Could not produce output matching the schema after ${attempts} attempt(s): ${lastErrors.join('; ')}`,
    retryable: false,
    fallbackRecommended: true,
  });
}
