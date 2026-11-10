/**
 * Skills: SKILL.md files in the open Agent Skills layout (one folder per skill,
 * YAML frontmatter + markdown body).
 *
 * Skills are parsed and linted at build time (`expo-ai-skills build`) into a
 * manifest the app bundles, so there is no file IO at runtime.
 *
 * At runtime, `mode: 'instructions'` skills are always in the instructions.
 * `mode: 'prompt'` skills are activated on demand: natively by adapters with
 * `activatesSkills` (Apple: an `activate_skill` Tool), otherwise by core's loop
 * here (a catalog in the instructions + an `{"activate_skill": …}` reply).
 */

import type {
  AdapterGenerateResult,
  AdapterStreamHandlers,
  AdapterUsage,
  NormalizedGenerateRequest,
  StreamHandle,
} from './adapter.js';
import { ExpoAIError } from './errors.js';
import { USAGE_COUNTS } from './result.js';
import type { ExpoAIProvider, ExpoAISkill, ExpoAISkillManifest } from './types.js';

/** Exhaustive over the routable providers, so a new provider can't be forgotten. */
const SKILL_PROVIDERS: Record<Exclude<ExpoAIProvider, 'system-preferred' | 'none'>, true> = {
  'apple-foundation-models': true,
  'apple-private-cloud-compute': true,
  'android-aicore-gemini-nano': true,
  'litert-lm': true,
  cloud: true,
};

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

type Scalar = string | number | boolean;
type Value = Scalar | Scalar[];

function invalid(message: string): ExpoAIError {
  return new ExpoAIError({
    code: 'INVALID_PROMPT',
    provider: 'none',
    message: `Invalid SKILL.md: ${message}`,
  });
}

/** Drop a `# comment` that sits outside quotes (YAML needs whitespace before `#`). */
function stripComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i] as string;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1] as string))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function parseScalar(raw: string): Scalar {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text) as string;
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

function parseValue(raw: string): Value {
  const text = stripComment(raw).trim();
  if (/^[|>][+-]?$/.test(text)) {
    throw invalid('block scalars (| or >) are not supported; use a single-line value.');
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    // ponytail: items split on every comma, so a quoted item can't contain one.
    return inner.length === 0 ? [] : inner.split(',').map(parseScalar);
  }
  return parseScalar(text);
}

/** The frontmatter subset skills use: `key: scalar`, `key: [a, b]`, and `key:` + `- item` lines. */
function parseFrontmatter(yaml: string): Record<string, Value> {
  const fields: Record<string, Value> = {};
  // The bare `key:` whose indented lines we're reading: a `- item` list, or a nested map we ignore.
  let block: string | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    if (/^\s/.test(line)) {
      const item = /^\s+-\s+(.*)$/.exec(stripComment(line));
      if (block !== null && item) {
        ((fields[block] ??= []) as Scalar[]).push(parseScalar(item[1] as string));
      } else if (block !== null) {
        delete fields[block]; // a nested map (e.g. `metadata`), not a list
        block = null;
      }
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) throw invalid(`cannot parse frontmatter line "${line}".`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1);
    block = null;
    if (stripComment(value).trim() === '') {
      // An empty block stays unset, like YAML's null.
      delete fields[key];
      block = key;
      continue;
    }
    fields[key] = parseValue(value);
  }
  return fields;
}

function stringList(fields: Record<string, Value>, key: string): string[] | undefined {
  const value = fields[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalid(`"${key}" must be a list of strings, e.g. [a, b].`);
  }
  return value as string[];
}

function integer(fields: Record<string, Value>, key: string): number | undefined {
  const value = fields[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number') throw invalid(`"${key}" must be an integer.`);
  return value;
}

/** Rough token count. ponytail: chars/4 heuristic; use a provider tokenizer when core has one. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Parse a SKILL.md. Throws an {@link ExpoAIError} (`INVALID_PROMPT`) when the
 * frontmatter is missing or malformed. Unknown keys (`license`, `metadata`, …)
 * are ignored.
 */
export function parseSkill(markdown: string): ExpoAISkill {
  const match = FRONTMATTER.exec(markdown);
  if (!match) throw invalid('missing "---" frontmatter.');
  const fields = parseFrontmatter(match[1] as string);

  const { name, description, mode = 'prompt', allowsDeactivation = true } = fields;
  if (typeof name !== 'string' || name.length === 0) throw invalid('missing "name".');
  if (typeof description !== 'string' || description.length === 0) {
    throw invalid(`skill "${name}" is missing "description".`);
  }
  if (mode !== 'prompt' && mode !== 'instructions') {
    throw invalid(`skill "${name}" has mode "${String(mode)}"; use "prompt" or "instructions".`);
  }
  if (typeof allowsDeactivation !== 'boolean') {
    throw invalid(`"allowsDeactivation" must be true or false.`);
  }
  const providers = stringList(fields, 'providers');
  const unknown = providers?.find((p) => !Object.prototype.hasOwnProperty.call(SKILL_PROVIDERS, p));
  if (unknown !== undefined) throw invalid(`skill "${name}" names unknown provider "${unknown}".`);
  if (providers?.length === 0) {
    throw invalid(`skill "${name}" has empty "providers"; omit it to apply to every provider.`);
  }

  const body = (match[2] ?? '').trim();
  const skill: ExpoAISkill = {
    name,
    description,
    version: integer(fields, 'version') ?? 1,
    mode,
    allowsDeactivation,
    requiredTools: stringList(fields, 'requiredTools') ?? [],
    body,
    estimatedTokens: estimateTokens(body),
  };
  if (providers) skill.providers = providers as ExpoAIProvider[];
  const maxTokens = integer(fields, 'maxTokens');
  if (maxTokens !== undefined) skill.maxTokens = maxTokens;
  return skill;
}

export type SkillLintResult = { level: 'error' | 'warning'; message: string };

/** Authoring rules `expo-ai-skills build` enforces. Any `error` fails the build. */
export function lintSkill(skill: ExpoAISkill): SkillLintResult[] {
  const results: SkillLintResult[] = [];
  const error = (message: string) => results.push({ level: 'error', message });
  if (!/^[a-z0-9-]{1,64}$/.test(skill.name)) {
    error(`name "${skill.name}" must be 1-64 characters of a-z, 0-9 and "-".`);
  }
  if (skill.description.trim().length === 0) error('description is empty.');
  if (skill.description.length > 1024) error('description is longer than 1024 characters.');
  if (skill.maxTokens !== undefined && skill.estimatedTokens > skill.maxTokens) {
    error(`body is ~${skill.estimatedTokens} tokens, over maxTokens ${skill.maxTokens}.`);
  }
  if (skill.body.length === 0) error('body is empty.');
  if (!/\bwhen\b/i.test(skill.description)) {
    results.push({ level: 'warning', message: 'description should say when to use the skill.' });
  }
  return results;
}

/** Fixed key order, so the manifest hash doesn't depend on how a skill was built. */
function canonicalSkill(skill: ExpoAISkill): ExpoAISkill {
  const canonical: ExpoAISkill = {
    name: skill.name,
    description: skill.description,
    version: skill.version,
    mode: skill.mode,
    allowsDeactivation: skill.allowsDeactivation,
    requiredTools: skill.requiredTools,
    body: skill.body,
    estimatedTokens: skill.estimatedTokens,
  };
  if (skill.providers !== undefined) canonical.providers = skill.providers;
  if (skill.maxTokens !== undefined) canonical.maxTokens = skill.maxTokens;
  return canonical;
}

/** 32-bit FNV-1a, hex. A change id, not a signature. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Bundle skills (sorted by name) under a stable content-hash `version`. Throws on duplicate names. */
export function buildSkillManifest(skills: ExpoAISkill[]): ExpoAISkillManifest {
  const sorted = skills
    .map(canonicalSkill)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.name === sorted[i - 1]!.name) {
      throw invalid(`duplicate skill name "${sorted[i]!.name}".`);
    }
  }
  return { version: fnv1a(JSON.stringify(sorted)), skills: sorted };
}

function applicableSkills(
  skills: ExpoAISkill[] | undefined,
  provider: ExpoAIProvider,
): ExpoAISkill[] {
  return (skills ?? []).filter((skill) => !skill.providers || skill.providers.includes(provider));
}

function section(skill: ExpoAISkill): string {
  return `## Skill: ${skill.name}\n${skill.description}\n\n${skill.body}`;
}

function joinInstructions(parts: (string | undefined)[]): string | undefined {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join('\n\n') : undefined;
}

/**
 * Append every skill that applies to `provider` after the base instructions,
 * whatever its mode. Structured-output paths use this: an activation reply
 * can't double as the requested object.
 */
export function applySkills(
  instructions: string | undefined,
  skills: ExpoAISkill[] | undefined,
  provider: ExpoAIProvider,
): { instructions: string | undefined; applied: string[] } {
  const applicable = applicableSkills(skills, provider);
  if (applicable.length === 0) return { instructions, applied: [] };
  return {
    instructions: joinInstructions([instructions, ...applicable.map(section)]),
    applied: applicable.map((skill) => skill.name),
  };
}

/* ---------------------------- on-demand activation ---------------------------- */

/** Activations allowed per response, so a model that keeps asking can't loop. */
export const MAX_SKILL_ACTIVATIONS = 3;

export type SkillPlan = {
  /** Instructions-mode skills: always in the instructions. */
  applied: string[];
  /** Prompt-mode skills: offered for on-demand activation. */
  offered: ExpoAISkill[];
  /** The instructions to send, with `activated` skills appended. */
  instructions(activated?: ExpoAISkill[]): string | undefined;
};

function catalog(offered: ExpoAISkill[]): string {
  return [
    '## Skills',
    'Load a skill when the request matches its description. To load one, reply with only ' +
      '{"activate_skill":"<name>"} and nothing else. Its instructions follow, then answer.',
    ...offered.map((skill) => `- ${skill.name}: ${skill.description}`),
  ].join('\n');
}

/**
 * Split the skills that apply to `provider` by mode. With `nativeActivation`
 * the adapter offers the prompt-mode skills itself (`req.skills`); otherwise
 * the instructions carry a catalog and core runs the activation loop.
 */
export function planSkills(
  base: string | undefined,
  skills: ExpoAISkill[] | undefined,
  provider: ExpoAIProvider,
  nativeActivation: boolean,
): SkillPlan {
  const applicable = applicableSkills(skills, provider);
  const always = applicable.filter((skill) => skill.mode === 'instructions');
  const offered = applicable.filter((skill) => skill.mode === 'prompt');
  const listed = !nativeActivation && offered.length > 0 ? catalog(offered) : undefined;
  return {
    applied: always.map((skill) => skill.name),
    offered,
    instructions: (activated = []) =>
      joinInstructions([base, ...always.map(section), listed, ...activated.map(section)]),
  };
}

// ponytail: exact-reply match, so an activation buried in prose is ignored (the reply is returned as-is).
const ACTIVATION =
  /^\s*(?:```(?:json)?\s*)?\{\s*"activate_skill"\s*:\s*"([^"]{1,64})"\s*\}\s*(?:```)?\s*$/;

/** The offered skill a reply asks to activate, if the whole reply is an activation. */
export function parseActivation(text: string, offered: ExpoAISkill[]): ExpoAISkill | undefined {
  const name = ACTIVATION.exec(text)?.[1];
  return name === undefined ? undefined : offered.find((skill) => skill.name === name);
}

/** The session turn that answers an activation: the skill body, then "go on". */
export function skillLoadedPrompt(skill: ExpoAISkill): string {
  return `Skill "${skill.name}" loaded:\n\n${skill.body}\n\nNow answer my previous request using it.`;
}

/** Sum two usages. A count missing from either side is unknown, never zero-filled. */
function addUsage(
  a: AdapterUsage | undefined,
  b: AdapterUsage | undefined,
): AdapterUsage | undefined {
  if (!a || !b) return undefined;
  const sum: AdapterUsage = {};
  for (const key of USAGE_COUNTS) {
    const x = a[key];
    const y = b[key];
    if (x !== undefined && y !== undefined) sum[key] = x + y;
  }
  if (a.source !== undefined && a.source === b.source) sum.source = a.source;
  else if (a.source !== undefined || b.source !== undefined) sum.source = 'estimated';
  return sum;
}

/** How core emulates activation: which skills, and the request after each activation. */
export type SkillActivation = {
  offered: ExpoAISkill[];
  /** One-shot: re-run with the skill in the instructions. Session: send `skillLoadedPrompt`. */
  next(first: NormalizedGenerateRequest, activated: ExpoAISkill[]): NormalizedGenerateRequest;
};

type Tracker = {
  /** The skill this reply activates, if any (and the budget allows another). */
  activation(text: string): ExpoAISkill | undefined;
  /** Fold one generation's usage in. */
  add(usage: AdapterUsage | undefined): void;
  finish(result: AdapterGenerateResult): AdapterGenerateResult;
  activated: ExpoAISkill[];
};

function tracker(activation: SkillActivation): Tracker {
  const activated: ExpoAISkill[] = [];
  let usage: AdapterUsage | undefined;
  let first = true;
  return {
    activated,
    activation(text) {
      if (activated.length >= MAX_SKILL_ACTIVATIONS) return undefined;
      const skill = parseActivation(text, activation.offered);
      // Asking again for a loaded skill ends the loop rather than repeating it.
      return skill && !activated.includes(skill) ? skill : undefined;
    },
    add(next) {
      usage = first ? next : addUsage(usage, next);
      first = false;
    },
    finish(result) {
      const final: AdapterGenerateResult = { ...result };
      if (usage) final.usage = usage;
      else delete final.usage;
      if (activated.length > 0) final.skillsActivated = activated.map((skill) => skill.name);
      return final;
    },
  };
}

/** Generate, activating offered skills the model asks for, then return the answer. */
export async function generateActivating(
  req: NormalizedGenerateRequest,
  activation: SkillActivation,
  generate: (req: NormalizedGenerateRequest) => Promise<AdapterGenerateResult>,
): Promise<AdapterGenerateResult> {
  const state = tracker(activation);
  let attempt = req;
  for (;;) {
    const result = await generate(attempt);
    state.add(result.usage);
    const skill = state.activation(result.text);
    if (!skill) return state.finish(result);
    state.activated.push(skill);
    attempt = activation.next(req, state.activated);
  }
}

/**
 * Stream with activation. A reply that opens with `{` or a code fence is held
 * back until done (it may be an activation); anything else streams as it comes.
 */
export function streamActivating(
  req: NormalizedGenerateRequest,
  activation: SkillActivation,
  start: (req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers) => StreamHandle,
  handlers: AdapterStreamHandlers,
): StreamHandle {
  const state = tracker(activation);
  let started = false;
  let cancelled = false;
  let current: StreamHandle | undefined;

  const run = (attempt: NormalizedGenerateRequest): void => {
    let held = '';
    let passing = false;
    current = start(attempt, {
      onStart: () => {
        if (started) return;
        started = true;
        handlers.onStart?.();
      },
      onDelta: (text) => {
        if (passing) return handlers.onDelta(text);
        held += text;
        const head = held.trimStart();
        // ponytail: a real answer that opens with `{` is held until done, then sent as one delta.
        if (head.length > 0 && !head.startsWith('{') && !head.startsWith('`')) {
          passing = true;
          handlers.onDelta(held);
        }
      },
      onDone: (result) => {
        if (cancelled) return;
        state.add(result.usage);
        const skill = passing ? undefined : state.activation(result.text || held);
        if (skill) {
          state.activated.push(skill);
          return run(activation.next(req, state.activated));
        }
        if (!passing && held.length > 0) handlers.onDelta(held);
        handlers.onDone(state.finish(result));
      },
      onError: handlers.onError,
    });
  };

  run(req);
  return {
    cancel: () => {
      cancelled = true;
      current?.cancel();
    },
  };
}
