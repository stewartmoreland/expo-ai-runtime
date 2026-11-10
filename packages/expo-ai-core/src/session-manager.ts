/**
 * Session manager (docs/prd.md §8).
 *
 * Owns the cross-platform session abstraction. When an adapter can create a
 * native session (e.g. Apple's stateful LanguageModelSession) we wrap it;
 * otherwise we emulate one by replaying the transcript as a prompt prefix
 * (needed for the stateless Android Prompt API).
 */

import type {
  AdapterGenerateResult,
  AdapterSession,
  AdapterStreamHandlers,
  ExpoAIAdapter,
  NormalizedGenerateRequest,
  NormalizedObjectRequest,
  StreamHandle,
} from './adapter.js';
import { ExpoAIError } from './errors.js';
import { isProviderAllowed } from './privacy.js';
import { finalizeObjectResult, finalizeResult } from './result.js';
import { selectAvailableAdapter } from './provider-router.js';
import {
  generateActivating,
  planSkills,
  skillLoadedPrompt,
  streamActivating,
  type SkillActivation,
} from './skills.js';
import { createStreamIterable, type StreamSource } from './stream-bridge.js';
import { generateValidatedObject } from './structured-output.js';
import type {
  CreateSessionOptions,
  ExpoAIProvider,
  ExpoAISkill,
  ExpoAISession,
  GenerateResult,
  SessionGenerateObjectOptions,
  SessionGenerateOptions,
} from './types.js';

let sessionCounter = 0;
function newSessionId(): string {
  sessionCounter += 1;
  const suffix = Math.random().toString(36).slice(2, 10);
  return `session_${sessionCounter}_${suffix}`;
}

type Turn = { role: 'user' | 'assistant'; content: string };

/** An emulated session over a stateless adapter: transcript replayed as a prefix. */
class EmulatedSession implements AdapterSession {
  readonly id = newSessionId();
  readonly provider: ExpoAIProvider;
  private history: Turn[] = [];

  constructor(
    private readonly adapter: ExpoAIAdapter,
    private readonly options: CreateSessionOptions,
  ) {
    this.provider = adapter.provider;
  }

  private compose(prompt: string): string {
    const lines: string[] = [];
    for (const turn of this.history) {
      lines.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`);
    }
    lines.push(`User: ${prompt}`);
    lines.push('Assistant:');
    return lines.join('\n');
  }

  private merge(req: NormalizedGenerateRequest): NormalizedGenerateRequest {
    const merged: NormalizedGenerateRequest = { ...req, prompt: this.compose(req.prompt) };
    if (this.options.instructions !== undefined) merged.instructions = this.options.instructions;
    if (merged.temperature === undefined && this.options.temperature !== undefined) {
      merged.temperature = this.options.temperature;
    }
    if (merged.maxOutputTokens === undefined && this.options.maxOutputTokens !== undefined) {
      merged.maxOutputTokens = this.options.maxOutputTokens;
    }
    if (merged.reasoningLevel === undefined && this.options.reasoningLevel !== undefined) {
      merged.reasoningLevel = this.options.reasoningLevel;
    }
    return merged;
  }

  async generate(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult> {
    const userPrompt = req.prompt;
    const result = await this.adapter.generate(this.merge(req));
    this.commitTurn(userPrompt, result.text);
    return result;
  }

  generateEphemeral(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult> {
    return this.adapter.generate(this.merge(req));
  }

  stream(req: NormalizedGenerateRequest, handlers: AdapterStreamHandlers): StreamHandle {
    const userPrompt = req.prompt;
    if (!this.adapter.stream) {
      // No native streaming: generate once, then surface as a single delta.
      let cancelled = false;
      this.adapter
        .generate(this.merge(req))
        .then((result) => {
          if (cancelled) return;
          handlers.onStart?.();
          if (result.text.length > 0) handlers.onDelta(result.text);
          this.commitTurn(userPrompt, result.text);
          handlers.onDone(result);
        })
        .catch((error) => {
          if (!cancelled) handlers.onError(ExpoAIError.from(error, this.provider));
        });
      return {
        cancel: () => {
          cancelled = true;
        },
      };
    }

    let accumulated = '';
    return this.adapter.stream(this.merge(req), {
      onStart: handlers.onStart,
      onDelta: (text) => {
        accumulated += text;
        handlers.onDelta(text);
      },
      onDone: (result) => {
        this.commitTurn(userPrompt, result.text.length > 0 ? result.text : accumulated);
        handlers.onDone(result);
      },
      onError: handlers.onError,
    });
  }

  commitTurn(userPrompt: string, assistantText: string): void {
    this.history.push({ role: 'user', content: userPrompt });
    this.history.push({ role: 'assistant', content: assistantText });
  }

  async reset(): Promise<void> {
    this.history = [];
  }

  async dispose(): Promise<void> {
    this.history = [];
  }
}

/**
 * Wraps any {@link AdapterSession} into the public {@link ExpoAISession}.
 *
 * `fallbackAdapter` is the underlying adapter; it is used to run structured
 * output off-session when the session can't generate without committing to its
 * transcript (so schema/repair scaffolding never pollutes a native session).
 */
function toExpoAISession(
  session: AdapterSession,
  fallbackAdapter?: ExpoAIAdapter,
  sessionOptions?: CreateSessionOptions,
  skills: string[] = [],
  activation?: SkillActivation,
): ExpoAISession {
  /** One user turn; with emulated activation, the activation exchange stays in the transcript. */
  function generateTurn(req: NormalizedGenerateRequest): Promise<AdapterGenerateResult> {
    const generate = (r: NormalizedGenerateRequest) => session.generate(r);
    return activation ? generateActivating(req, activation, generate) : generate(req);
  }

  function reqFrom(options: SessionGenerateOptions): NormalizedGenerateRequest {
    const req: NormalizedGenerateRequest = { prompt: options.prompt };
    // Per-call values win; otherwise fall back to the session-level defaults.
    const temperature = options.temperature ?? sessionOptions?.temperature;
    if (temperature !== undefined) req.temperature = temperature;
    const maxOutputTokens = options.maxOutputTokens ?? sessionOptions?.maxOutputTokens;
    if (maxOutputTokens !== undefined) req.maxOutputTokens = maxOutputTokens;
    if (sessionOptions?.reasoningLevel !== undefined) {
      req.reasoningLevel = sessionOptions.reasoningLevel;
    }
    if (options.signal !== undefined) req.signal = options.signal;
    return req;
  }

  /** A policy narrowed after creation must stop the session from being used. */
  function guard(): void {
    if (!isProviderAllowed(session.provider)) {
      throw new ExpoAIError({
        code: 'UNAVAILABLE',
        provider: session.provider,
        message: `Provider ${session.provider} is no longer permitted by privacy policy.`,
        fallbackRecommended: false,
      });
    }
  }

  async function generateObjectWithMeta<T = unknown>(
    options: SessionGenerateObjectOptions,
  ): Promise<{ object: T; result: GenerateResult }> {
    guard();
    // Prefer a non-committing generation so schema/repair scaffolding never
    // pollutes the transcript: the session's own ephemeral generate (keeps
    // context), else a one-shot via the underlying adapter (no context, but no
    // pollution). Only the last resort — session.generate — commits.
    // A one-shot still carries the session instructions (and so its skills).
    const instructions = sessionOptions?.instructions;
    const oneShot = <R extends NormalizedGenerateRequest>(req: R): R =>
      instructions !== undefined ? { ...req, instructions } : req;
    const ephemeral =
      session.generateEphemeral?.bind(session) ??
      (fallbackAdapter
        ? (req: NormalizedGenerateRequest) => fallbackAdapter.generate(oneShot(req))
        : undefined);
    const nonCommitting = Boolean(ephemeral);
    // Native guided generation never commits: the session's own, else a one-shot.
    const generateObject =
      session.generateObject?.bind(session) ??
      (fallbackAdapter?.generateObject
        ? (req: NormalizedObjectRequest) => fallbackAdapter.generateObject!(oneShot(req))
        : undefined);

    const validated = await generateValidatedObject({
      provider: session.provider,
      schema: options.schema,
      basePrompt: options.prompt,
      mode: options.structuredOutput ?? 'auto',
      ...(options.schemaName !== undefined ? { schemaName: options.schemaName } : {}),
      ...(options.maxRepairAttempts !== undefined
        ? { maxRepairAttempts: options.maxRepairAttempts }
        : {}),
      generateText: (prompt) => {
        const req = reqFrom({ ...options, prompt });
        return ephemeral ? ephemeral(req) : session.generate(req);
      },
      ...(generateObject
        ? {
            nativeObject: () => {
              // Forward signal/temperature/maxOutputTokens, not just prompt+schema.
              const req: NormalizedObjectRequest = { ...reqFrom(options), schema: options.schema };
              if (options.schemaName !== undefined) req.schemaName = options.schemaName;
              return generateObject(req);
            },
          }
        : {}),
    });

    // Record exactly one clean turn when generation was non-committing and the
    // session can record turns. If session.generate was used, turns are already
    // recorded by it.
    if (nonCommitting) session.commitTurn?.(options.prompt, validated.raw);
    return {
      object: validated.object as T,
      result: finalizeObjectResult(validated, session.provider, false, skills),
    };
  }

  return {
    id: session.id,
    provider: session.provider,

    async generate(options) {
      guard();
      const result = await generateTurn(reqFrom(options));
      return finalizeResult(result, session.provider, false, skills);
    },

    stream(options) {
      const req = reqFrom(options);
      const stream = session.stream?.bind(session);
      const source: StreamSource = {
        provider: session.provider,
        usedFallback: false,
        skills,
        signal: req.signal,
        startNativeStream: stream
          ? (handlers) =>
              activation
                ? streamActivating(req, activation, stream, handlers)
                : stream(req, handlers)
          : null,
        generateOnce: () => generateTurn(req),
      };
      // Guard lazily so the policy error surfaces from the iterable, like every other error.
      return {
        async *[Symbol.asyncIterator]() {
          guard();
          yield* createStreamIterable(source);
        },
      };
    },

    generateObjectWithMeta,

    async generateObject<T = unknown>(options: SessionGenerateObjectOptions): Promise<T> {
      return (await generateObjectWithMeta<T>(options)).object;
    },

    async prewarm(options) {
      guard();
      return (await session.prewarm?.(options ?? {})) ?? false;
    },

    reset: () => session.reset(),
    dispose: () => session.dispose(),
  };
}

export async function createSession(options: CreateSessionOptions = {}): Promise<ExpoAISession> {
  const { adapter, provider } = await selectAvailableAdapter(options);

  // Skills are planned once, against the bound provider. Only a native session
  // of an `activatesSkills` adapter activates them itself.
  const { skills, ...rest } = options;
  const native = adapter.activatesSkills === true && adapter.createSession !== undefined;
  const plan = planSkills(options.instructions, skills, provider, native);
  const composed: CreateSessionOptions = rest;
  const instructions = plan.instructions();
  if (instructions !== undefined) composed.instructions = instructions;
  const offered = plan.offered.length > 0 ? plan.offered : undefined;

  const adapterSession = adapter.createSession
    ? await adapter.createSession(native && offered ? { ...composed, skills: offered } : composed)
    : new EmulatedSession(adapter, composed);

  // Emulated activation answers in the transcript: the next turn carries the skill body.
  const activation: SkillActivation | undefined =
    !native && offered
      ? {
          offered,
          next: (first, activated) => ({
            ...first,
            prompt: skillLoadedPrompt(activated[activated.length - 1] as ExpoAISkill),
          }),
        }
      : undefined;

  return toExpoAISession(adapterSession, adapter, composed, plan.applied, activation);
}
