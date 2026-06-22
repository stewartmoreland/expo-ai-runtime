import { validateAgainstSchema, type JSONSchema } from '@stewmore/expo-ai-core';

/** True when `value` satisfies `schema` per the runtime's validator. */
export function scoreSchemaValidity(value: unknown, schema: JSONSchema): boolean {
  return validateAgainstSchema(value, schema).valid;
}
