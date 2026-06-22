import type { JSONSchema } from '@stewmore/expo-ai-core';

/**
 * Produce a value that satisfies the (subset) schema. Used by the eval mock
 * adapters so structured-output cases have something valid to return.
 */
export function sampleFromSchema(schema: JSONSchema): unknown {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  switch (type) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      const keys = new Set<string>([...(schema.required ?? []), ...Object.keys(props)]);
      for (const key of keys) {
        const child = props[key];
        obj[key] = child ? sampleFromSchema(child) : 'sample';
      }
      return obj;
    }
    case 'array': {
      const count = Math.max(1, schema.minItems ?? 1);
      const itemSchema = schema.items ?? { type: 'string' };
      return Array.from({ length: count }, () => sampleFromSchema(itemSchema));
    }
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    case 'null':
      return null;
    case 'string':
    default:
      return 'sample';
  }
}
