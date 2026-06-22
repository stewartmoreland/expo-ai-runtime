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
import { finalizeResult } from './result.js';
import { selectAvailableAdapter } from './provider-router.js';
import { createStreamIterable, type StreamSource } from './stream-bridge.js';
import { generateValidatedObject } from './structured-output.js';
import type {
  CreateSessionOptions,
  ExpoAIProvider,
  ExpoAISession,
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
): ExpoAISession {
  function reqFrom(options: SessionGenerateOptions): NormalizedGenerateRequest {
    const req: NormalizedGenerateRequest = { prompt: options.prompt };
    // Per-call values win; otherwise fall back to the session-level defaults.
    const temperature = options.temperature ?? sessionOptions?.temperature;
    if (temperature !== undefined) req.temperature = temperature;
    const maxOutputTokens = options.maxOutputTokens ?? sessionOptions?.maxOutputTokens;
    if (maxOutputTokens !== undefined) req.maxOutputTokens = maxOutputTokens;
    if (options.signal !== undefined) req.signal = options.signal;
    return req;
  }

  return {
    id: session.id,
    provider: session.provider,

    async generate(options) {
      const result = await session.generate(reqFrom(options));
      return finalizeResult(result, session.provider, false);
    },

    stream(options) {
      const req = reqFrom(options);
      const source: StreamSource = {
        provider: session.provider,
        usedFallback: false,
        signal: req.signal,
        startNativeStream: session.stream ? (handlers) => session.stream!(req, handlers) : null,
        generateOnce: () => session.generate(req),
      };
      return createStreamIterable(source);
    },

    async generateObject<T = unknown>(options: SessionGenerateObjectOptions): Promise<T> {
      // Prefer a non-committing generation so schema/repair scaffolding never
      // pollutes the transcript: the session's own ephemeral generate (keeps
      // context), else a one-shot via the underlying adapter (no context, but no
      // pollution). Only the last resort — session.generate — commits.
      const ephemeral =
        session.generateEphemeral?.bind(session) ??
        (fallbackAdapter ? fallbackAdapter.generate.bind(fallbackAdapter) : undefined);
      const nonCommitting = Boolean(ephemeral);

      const runText = async (prompt: string): Promise<string> => {
        const req = reqFrom({ ...options, prompt });
        const result = ephemeral ? await ephemeral(req) : await session.generate(req);
        return result.text;
      };

      const nativeObject = session.generateObject
        ? async (): Promise<string> => {
            // Forward signal/temperature/maxOutputTokens, not just prompt+schema.
            const req: NormalizedObjectRequest = { ...reqFrom(options), schema: options.schema };
            if (options.schemaName !== undefined) req.schemaName = options.schemaName;
            return (await session.generateObject!(req)).text;
          }
        : undefined;

      const validated = await generateValidatedObject({
        provider: session.provider,
        schema: options.schema,
        basePrompt: options.prompt,
        ...(options.schemaName !== undefined ? { schemaName: options.schemaName } : {}),
        ...(options.maxRepairAttempts !== undefined
          ? { maxRepairAttempts: options.maxRepairAttempts }
          : {}),
        generateText: runText,
        ...(nativeObject ? { nativeObject } : {}),
      });

      // Record exactly one clean turn when generation was non-committing and the
      // session can record turns. If session.generate was used, turns are already
      // recorded by it.
      if (nonCommitting) session.commitTurn?.(options.prompt, validated.raw);
      return validated.object as T;
    },

    reset: () => session.reset(),
    dispose: () => session.dispose(),
  };
}

export async function createSession(options: CreateSessionOptions = {}): Promise<ExpoAISession> {
  const selectOptions: { provider?: ExpoAIProvider; fallback?: CreateSessionOptions['fallback'] } =
    {};
  if (options.provider !== undefined) selectOptions.provider = options.provider;
  if (options.fallback !== undefined) selectOptions.fallback = options.fallback;

  const { adapter } = await selectAvailableAdapter(selectOptions);

  const adapterSession = adapter.createSession
    ? await adapter.createSession(options)
    : new EmulatedSession(adapter, options);

  return toExpoAISession(adapterSession, adapter, options);
}
