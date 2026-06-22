/**
 * Mock generation — runs with zero API keys so the cloud-fallback and
 * structured-output examples work offline. For a schema request it produces a
 * value that satisfies the schema; otherwise it returns a short canned reply.
 */

export type GenerateBody = {
  prompt: string;
  instructions?: string;
  temperature?: number;
  maxOutputTokens?: number;
  schema?: LooseSchema;
  schemaName?: string;
};

export type LooseSchema = {
  type?: string | string[];
  properties?: Record<string, LooseSchema>;
  required?: string[];
  items?: LooseSchema;
  enum?: unknown[];
  minimum?: number;
  minItems?: number;
};

export type GenerateOutput = {
  text: string;
  finishReason: 'stop';
  usage: { inputTokens: number; outputTokens: number };
};

export function mockGenerate(body: GenerateBody): GenerateOutput {
  const text = body.schema ? JSON.stringify(sampleFromSchema(body.schema)) : mockReply(body.prompt);
  return {
    text,
    finishReason: 'stop',
    usage: { inputTokens: estimateTokens(body.prompt), outputTokens: estimateTokens(text) },
  };
}

function mockReply(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  const preview = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
  return [
    'This is a mock response from the Expo AI Runtime reference server.',
    `You asked: "${preview}".`,
    'Set OPENAI_API_KEY (or ANTHROPIC_API_KEY) to proxy a real model instead.',
  ].join(' ');
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Build a value that satisfies the (subset) schema the runtime validates. */
export function sampleFromSchema(schema: LooseSchema): unknown {
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
