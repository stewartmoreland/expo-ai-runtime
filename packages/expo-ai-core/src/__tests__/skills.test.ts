import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from '../cli/skills-cli.js';
import {
  ExpoAI,
  ExpoAIError,
  buildSkillManifest,
  clearAdapters,
  lintSkill,
  parseSkill,
  registerAdapter,
  type ExpoAISkill,
  type JSONSchema,
} from '../index.js';
import type { NormalizedGenerateRequest } from '../adapter.js';
import { MAX_SKILL_ACTIVATIONS, applySkills } from '../skills.js';
import type { CreateSessionOptions } from '../types.js';
import { createMockAdapter, resetPrivacyPolicy, type MockAdapterConfig } from '../testing.js';

beforeEach(() => clearAdapters());
afterEach(() => {
  resetPrivacyPolicy();
  vi.restoreAllMocks();
});

const DEBT = `---
name: debt-avalanche
description: Plan debt payoff by highest APR first; use when the user asks how to pay down multiple debts
version: 3
mode: prompt            # prompt (default) | instructions
allowsDeactivation: false
requiredTools: [list_debts, simulate_payoff]
providers: [apple-foundation-models, cloud]
maxTokens: 600
license: MIT
metadata:
  author: someone
---
# Debt avalanche
1. Call list_debts.
`;

function skillMd(frontmatter: string, body = 'Do the thing.'): string {
  return `---\n${frontmatter}\n---\n${body}\n`;
}

/** An always-on (instructions-mode) skill; pass `{ mode: 'prompt' }` for on-demand. */
function skill(name: string, extra: Partial<ExpoAISkill> = {}): ExpoAISkill {
  const parsed = parseSkill(
    skillMd(`name: ${name}\ndescription: Use when testing ${name}`, `${name} body`),
  );
  return { ...parsed, mode: 'instructions', ...extra };
}

/** A mock adapter that records the instructions of every request it serves. */
function recording(config: MockAdapterConfig) {
  const adapter = createMockAdapter(config);
  const seen: (string | undefined)[] = [];
  const generate = adapter.generate;
  adapter.generate = (req) => {
    seen.push(req.instructions);
    return generate(req);
  };
  const stream = adapter.stream;
  if (stream) {
    adapter.stream = (req, handlers) => {
      seen.push(req.instructions);
      return stream(req, handlers);
    };
  }
  registerAdapter(adapter);
  return seen;
}

describe('parseSkill', () => {
  it('parses scalars, arrays, comments and ignores unknown/nested keys', () => {
    const parsed = parseSkill(DEBT);
    expect(parsed).toEqual({
      name: 'debt-avalanche',
      description:
        'Plan debt payoff by highest APR first; use when the user asks how to pay down multiple debts',
      version: 3,
      mode: 'prompt',
      allowsDeactivation: false,
      requiredTools: ['list_debts', 'simulate_payoff'],
      providers: ['apple-foundation-models', 'cloud'],
      maxTokens: 600,
      body: '# Debt avalanche\n1. Call list_debts.',
      estimatedTokens: Math.ceil('# Debt avalanche\n1. Call list_debts.'.length / 4),
    });
  });

  it('applies defaults', () => {
    const parsed = parseSkill(skillMd('name: a\ndescription: d'));
    expect(parsed).toMatchObject({
      version: 1,
      mode: 'prompt',
      allowsDeactivation: true,
      requiredTools: [],
    });
    expect(parsed.providers).toBeUndefined();
    expect(parsed.maxTokens).toBeUndefined();
  });

  it('reads block-style lists and still ignores nested maps', () => {
    const parsed = parseSkill(
      skillMd(
        [
          'name: a',
          'description: d',
          'providers:',
          '  - apple-foundation-models # on-device only',
          '  - "litert-lm"',
          'requiredTools:',
          '  - list_debts',
          'metadata:',
          '  - stray',
          '  author: someone',
          'license:',
        ].join('\n'),
      ),
    );
    expect(parsed.providers).toEqual(['apple-foundation-models', 'litert-lm']);
    expect(parsed.requiredTools).toEqual(['list_debts']);
    expect(applySkills(undefined, [parsed], 'cloud').applied).toEqual([]);
  });

  it('keeps # inside quotes and unescapes quoted strings', () => {
    const parsed = parseSkill(
      skillMd(`name: a\ndescription: "Use when #1 \\"matters\\"" # trailing\nmode: 'instructions'`),
    );
    expect(parsed.description).toBe('Use when #1 "matters"');
    expect(parsed.mode).toBe('instructions');
  });

  it.each([
    ['no frontmatter', '# just markdown'],
    ['missing name', skillMd('description: d')],
    ['missing description', skillMd('name: a')],
    ['bad mode', skillMd('name: a\ndescription: d\nmode: always')],
    ['unknown provider', skillMd('name: a\ndescription: d\nproviders: [openai]')],
    ['unknown block-list provider', skillMd('name: a\ndescription: d\nproviders:\n  - openai')],
    ['empty providers', skillMd('name: a\ndescription: d\nproviders: []')],
    ['block scalar', skillMd('name: a\ndescription: >\n  folded')],
    ['non-integer version', skillMd('name: a\ndescription: d\nversion: two')],
  ])('throws INVALID_PROMPT on %s', (_label, markdown) => {
    expect(() => parseSkill(markdown)).toThrow(ExpoAIError);
    try {
      parseSkill(markdown);
    } catch (error) {
      expect((error as ExpoAIError).code).toBe('INVALID_PROMPT');
    }
  });
});

describe('lintSkill', () => {
  it('passes a well-formed skill', () => {
    expect(lintSkill(parseSkill(DEBT))).toEqual([]);
  });

  it('reports errors and the "when" warning', () => {
    const bad = parseSkill(
      skillMd('name: Bad_Name\ndescription: Does a thing\nmaxTokens: 1', 'x'.repeat(40)),
    );
    const results = lintSkill(bad);
    expect(results.filter((r) => r.level === 'error').map((r) => r.message)).toEqual([
      expect.stringContaining('Bad_Name'),
      expect.stringContaining('over maxTokens 1'),
    ]);
    expect(results.filter((r) => r.level === 'warning')).toHaveLength(1);
    expect(lintSkill({ ...bad, name: 'ok', maxTokens: undefined, body: '' })).toContainEqual({
      level: 'error',
      message: 'body is empty.',
    });
    expect(lintSkill({ ...bad, description: 'when '.repeat(300) })).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('1024') }),
    );
  });
});

describe('buildSkillManifest', () => {
  it('sorts by name and hashes stably regardless of input order or key order', () => {
    const a = skill('alpha');
    const b = skill('beta');
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as ExpoAISkill;
    const one = buildSkillManifest([b, a]);
    expect(one.skills.map((s) => s.name)).toEqual(['alpha', 'beta']);
    expect(buildSkillManifest([reordered, b]).version).toBe(one.version);
    expect(one.version).toMatch(/^[0-9a-f]{8}$/);
    expect(buildSkillManifest([a, { ...b, body: 'changed' }]).version).not.toBe(one.version);
  });

  it('throws on duplicate names', () => {
    expect(() => buildSkillManifest([skill('alpha'), skill('alpha')])).toThrow(/duplicate/);
  });
});

describe('skills in the router', () => {
  it('appends applicable skills after the instructions and reports them', async () => {
    const seen = recording({ provider: 'apple-foundation-models' });
    const result = await ExpoAI.generate({
      prompt: 'hi',
      instructions: 'Be brief.',
      skills: [
        skill('alpha'),
        skill('android-only', { providers: ['android-aicore-gemini-nano'] }),
      ],
    });
    expect(seen[0]).toBe('Be brief.\n\n## Skill: alpha\nUse when testing alpha\n\nalpha body');
    expect(result.skills).toEqual(['alpha']);
  });

  it('omits result.skills and leaves instructions alone when none apply', async () => {
    const seen = recording({ provider: 'apple-foundation-models' });
    const result = await ExpoAI.generate({
      prompt: 'hi',
      skills: [skill('android-only', { providers: ['android-aicore-gemini-nano'] })],
    });
    expect(seen[0]).toBeUndefined();
    expect(result.skills).toBeUndefined();
    expect('skills' in result).toBe(false);
  });

  it('re-applies skills for the provider that actually serves after a fallback', async () => {
    const appleSeen = recording({
      provider: 'apple-foundation-models',
      throwError: { code: 'MODEL_NOT_READY' },
    });
    const androidSeen = recording({ provider: 'android-aicore-gemini-nano' });
    const skills = [
      skill('apple-only', { providers: ['apple-foundation-models'] }),
      skill('android-only', { providers: ['android-aicore-gemini-nano'] }),
    ];
    const result = await ExpoAI.generate({ prompt: 'hi', skills });
    expect(appleSeen[0]).toContain('## Skill: apple-only');
    expect(androidSeen[0]).toContain('## Skill: android-only');
    expect(androidSeen[0]).not.toContain('apple-only');
    expect(result.provider).toBe('android-aicore-gemini-nano');
    expect(result.skills).toEqual(['android-only']);
  });

  it('stamps skills on the stream done result', async () => {
    const seen = recording({ provider: 'apple-foundation-models' });
    let done;
    for await (const chunk of ExpoAI.stream({ prompt: 'hi', skills: [skill('alpha')] })) {
      if (chunk.type === 'done') done = chunk.result;
    }
    expect(seen[0]).toContain('## Skill: alpha');
    expect(done).toMatchObject({ skills: ['alpha'] });
  });

  it('carries skills through generateObject and streamObject', async () => {
    const schema: JSONSchema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const seen = recording({ provider: 'apple-foundation-models', respondWith: '{"ok":true}' });
    const { result } = await ExpoAI.generateObjectWithMeta({
      prompt: 'hi',
      schema,
      structuredOutput: 'emulated',
      skills: [skill('alpha')],
    });
    expect(result.skills).toEqual(['alpha']);
    const streamed = ExpoAI.streamObject({ prompt: 'hi', schema, skills: [skill('beta')] });
    expect((await streamed.result).skills).toEqual(['beta']);
    expect(seen.every((i) => i?.includes('## Skill:'))).toBe(true);
  });
});

describe('skills in sessions', () => {
  it('composes skills into the session instructions against the bound provider', async () => {
    const seen = recording({ provider: 'android-aicore-gemini-nano', supportsStreaming: false });
    const session = await ExpoAI.createSession({
      instructions: 'Base.',
      skills: [skill('alpha'), skill('apple-only', { providers: ['apple-foundation-models'] })],
    });
    const result = await session.generate({ prompt: 'hi' });
    expect(seen[0]).toBe('Base.\n\n## Skill: alpha\nUse when testing alpha\n\nalpha body');
    expect(result.skills).toEqual(['alpha']);
    let done;
    for await (const chunk of session.stream({ prompt: 'again' })) {
      if (chunk.type === 'done') done = chunk.result;
    }
    expect(done).toMatchObject({ skills: ['alpha'] });
  });

  it('passes composed instructions to a native session and keeps them on one-shot object calls', async () => {
    const adapter = createMockAdapter({
      provider: 'apple-foundation-models',
      objectText: '{"ok":true}',
    });
    const created: (string | undefined)[] = [];
    const objectInstructions: (string | undefined)[] = [];
    adapter.createSession = async (opts) => {
      created.push(opts.instructions);
      expect('skills' in opts).toBe(false);
      return {
        id: 's',
        provider: 'apple-foundation-models',
        generate: (req) => adapter.generate(req),
        reset: async () => {},
        dispose: async () => {},
      };
    };
    const generateObject = adapter.generateObject!;
    adapter.generateObject = (req) => {
      objectInstructions.push(req.instructions);
      return generateObject(req);
    };
    registerAdapter(adapter);
    const session = await ExpoAI.createSession({ skills: [skill('alpha')] });
    const { result } = await session.generateObjectWithMeta({
      prompt: 'hi',
      schema: { type: 'object' },
      structuredOutput: 'native',
    });
    expect(created[0]).toContain('## Skill: alpha');
    expect(objectInstructions[0]).toContain('## Skill: alpha');
    expect(result.skills).toEqual(['alpha']);
  });
});

describe('on-demand activation (core loop)', () => {
  const USAGE = { inputTokens: 1, outputTokens: 2, source: 'provider' as const };
  const prompt = (name: string) => skill(name, { mode: 'prompt' });

  /** Replies with an activation until `name`'s body is in the instructions, then answers. */
  function activatingAdapter(name: string, config: MockAdapterConfig = {}) {
    const adapter = createMockAdapter({
      provider: 'android-aicore-gemini-nano',
      usage: USAGE,
      ...config,
    });
    const seen: NormalizedGenerateRequest[] = [];
    const reply = (req: NormalizedGenerateRequest) =>
      req.instructions?.includes(`${name} body`)
        ? `answer using ${name}`
        : `{"activate_skill":"${name}"}`;
    adapter.generate = async (req) => {
      seen.push(req);
      return { text: reply(req), finishReason: 'stop', usage: USAGE };
    };
    // Word-by-word deltas, like the mock's own stream.
    adapter.stream = (req, handlers) => {
      seen.push(req);
      const text = reply(req);
      handlers.onStart?.();
      for (const token of text.split(/(\s+)/).filter(Boolean)) handlers.onDelta(token);
      handlers.onDone({ text, finishReason: 'stop', usage: USAGE });
      return { cancel: () => {} };
    };
    registerAdapter(adapter);
    return { adapter, seen };
  }

  it('offers a catalog, loads the skill the model asks for, then answers', async () => {
    const { seen } = activatingAdapter('alpha');
    const result = await ExpoAI.generate({
      prompt: 'hi',
      instructions: 'Base.',
      skills: [prompt('alpha')],
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.instructions).toContain('## Skills');
    expect(seen[0]!.instructions).toContain('- alpha: Use when testing alpha');
    expect(seen[0]!.instructions).not.toContain('alpha body');
    expect(seen[1]!.instructions).toContain('## Skill: alpha');
    expect(seen[1]!.prompt).toBe('hi');
    expect(result.text).toBe('answer using alpha');
    expect(result.skills).toEqual(['alpha']);
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 4, source: 'provider' });
  });

  it('answers in one call when the model does not activate, and reports no skills', async () => {
    const seen = recording({ provider: 'android-aicore-gemini-nano', respondWith: 'plain' });
    const result = await ExpoAI.generate({ prompt: 'hi', skills: [prompt('alpha')] });
    expect(seen).toHaveLength(1);
    expect(result.text).toBe('plain');
    expect(result.skills).toBeUndefined();
  });

  it('returns an activation for an unknown skill as-is', async () => {
    const seen = recording({
      provider: 'android-aicore-gemini-nano',
      respondWith: '{"activate_skill":"nope"}',
    });
    const result = await ExpoAI.generate({ prompt: 'hi', skills: [prompt('alpha')] });
    expect(seen).toHaveLength(1);
    expect(result.text).toBe('{"activate_skill":"nope"}');
  });

  it('caps activations per response', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const adapter = createMockAdapter({ provider: 'cloud' });
    let calls = 0;
    adapter.generate = async (req) => {
      calls++;
      const next = names.find((n) => !req.instructions?.includes(`${n} body`));
      return { text: `{"activate_skill":"${next}"}` };
    };
    registerAdapter(adapter);
    const result = await ExpoAI.generate({
      prompt: 'hi',
      provider: 'cloud',
      skills: names.map(prompt),
    });
    expect(calls).toBe(MAX_SKILL_ACTIVATIONS + 1);
    expect(result.skills).toEqual(['a', 'b', 'c']);
  });

  it('keeps instructions-mode skills always on beside the catalog', async () => {
    const { seen } = activatingAdapter('alpha');
    const result = await ExpoAI.generate({
      prompt: 'hi',
      skills: [skill('always'), prompt('alpha')],
    });
    expect(seen[0]!.instructions).toContain('## Skill: always');
    expect(result.skills).toEqual(['always', 'alpha']);
  });

  it('holds back an activation reply when streaming, and passes ordinary answers through', async () => {
    activatingAdapter('alpha');
    const deltas: string[] = [];
    let done;
    for await (const chunk of ExpoAI.stream({ prompt: 'hi', skills: [prompt('alpha')] })) {
      if (chunk.type === 'delta') deltas.push(chunk.text);
      if (chunk.type === 'done') done = chunk.result;
    }
    expect(deltas.join('')).toBe('answer using alpha');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).not.toContain('activate_skill');
    expect(done).toMatchObject({ skills: ['alpha'], text: 'answer using alpha' });
  });

  it('activates in an emulated session through a follow-up turn kept in the transcript', async () => {
    const adapter = createMockAdapter({ provider: 'cloud' });
    const prompts: string[] = [];
    adapter.generate = async (req) => {
      prompts.push(req.prompt);
      return {
        text: req.prompt.includes('Skill "alpha" loaded') ? 'final' : '{"activate_skill":"alpha"}',
      };
    };
    registerAdapter(adapter);
    const session = await ExpoAI.createSession({ provider: 'cloud', skills: [prompt('alpha')] });
    const result = await session.generate({ prompt: 'hi' });
    expect(result.text).toBe('final');
    expect(result.skills).toEqual(['alpha']);
    expect(prompts[1]).toContain('User: hi\nAssistant: {"activate_skill":"alpha"}');
    expect(prompts[1]).toContain('alpha body');
  });
});

describe('on-demand activation (native adapters)', () => {
  it('sends prompt-mode skills as req.skills, without a catalog, and reports what native activated', async () => {
    const adapter = createMockAdapter({ provider: 'apple-foundation-models' });
    const seen: NormalizedGenerateRequest[] = [];
    Object.assign(adapter, { activatesSkills: true });
    adapter.generate = async (req) => {
      seen.push(req);
      return { text: 'ok', skillsActivated: ['alpha'] };
    };
    registerAdapter(adapter);
    const result = await ExpoAI.generate({
      prompt: 'hi',
      skills: [skill('alpha', { mode: 'prompt' }), skill('always')],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.skills?.map((s) => s.name)).toEqual(['alpha']);
    expect(seen[0]!.instructions).not.toContain('## Skills');
    expect(result.skills).toEqual(['always', 'alpha']);
  });

  it('hands prompt-mode skills to a native session', async () => {
    const adapter = createMockAdapter({ provider: 'apple-foundation-models' });
    Object.assign(adapter, { activatesSkills: true });
    const created: CreateSessionOptions[] = [];
    adapter.createSession = async (opts) => {
      created.push(opts);
      return {
        id: 's',
        provider: 'apple-foundation-models',
        generate: async () => ({ text: 'ok', skillsActivated: ['alpha'] }),
        reset: async () => {},
        dispose: async () => {},
      };
    };
    registerAdapter(adapter);
    const session = await ExpoAI.createSession({ skills: [skill('alpha', { mode: 'prompt' })] });
    const result = await session.generate({ prompt: 'hi' });
    expect(created[0]!.skills?.map((s) => s.name)).toEqual(['alpha']);
    expect(created[0]!.instructions).toBeUndefined();
    expect(result.skills).toEqual(['alpha']);
  });
});

describe('expo-ai-skills CLI', () => {
  function tmpSkills(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'expo-ai-skills-'));
    for (const [folder, content] of Object.entries(files)) {
      mkdirSync(join(dir, folder));
      writeFileSync(join(dir, folder, 'SKILL.md'), content);
    }
    return dir;
  }

  it('writes the manifest when every skill lints clean', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = tmpSkills({ 'debt-avalanche': DEBT });
    expect(run(['build', dir, '--out', 'out.json'], dir)).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
    expect(manifest).toEqual(buildSkillManifest([parseSkill(DEBT)]));
  });

  it('fails on a folder/name mismatch or a parse error and writes nothing', () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
    const dir = tmpSkills({ wrong: DEBT, broken: '# no frontmatter' });
    expect(run(['build', dir], dir)).toBe(1);
    expect(errors.join('\n')).toMatch(/must equal its folder name "wrong"/);
    expect(errors.join('\n')).toMatch(/missing "---" frontmatter/);
    expect(() => readFileSync(join(dir, 'skills.manifest.json'))).toThrow();
  });

  it('reports a file passed as <dir> instead of crashing', () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => errors.push(line));
    const dir = tmpSkills({ 'debt-avalanche': DEBT });
    expect(run(['build', join(dir, 'debt-avalanche', 'SKILL.md')], dir)).toBe(1);
    expect(errors.join('\n')).toMatch(/directory not found/);
  });

  it('follows a symlinked skill folder', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const real = tmpSkills({ 'debt-avalanche': DEBT });
    const dir = mkdtempSync(join(tmpdir(), 'expo-ai-skills-'));
    symlinkSync(join(real, 'debt-avalanche'), join(dir, 'debt-avalanche'));
    expect(run(['build', dir, '--out', 'out.json'], dir)).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'));
    expect(manifest.skills.map((s: ExpoAISkill) => s.name)).toEqual(['debt-avalanche']);
  });
});
