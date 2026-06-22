import { beforeEach, describe, expect, it } from 'vitest';

import { ExpoAI, clearAdapters, registerAdapter, type JSONSchema } from '../index.js';
import { createMockAdapter } from '../testing.js';

beforeEach(() => clearAdapters());

const personSchema: JSONSchema = {
  type: 'object',
  properties: { name: { type: 'string' }, age: { type: 'integer' } },
  required: ['name', 'age'],
};

describe('sessions (emulated over a stateless adapter)', () => {
  it('binds the session to the available provider', async () => {
    registerAdapter(createMockAdapter({ provider: 'apple-foundation-models', respondWith: 'ok' }));
    const session = await ExpoAI.createSession({ instructions: 'be brief' });
    expect(session.provider).toBe('apple-foundation-models');
    expect(typeof session.id).toBe('string');
  });

  it('replays the transcript as context across turns', async () => {
    const prompts: string[] = [];
    registerAdapter(
      createMockAdapter({
        provider: 'android-aicore-gemini-nano',
        respondWith: (prompt) => {
          prompts.push(prompt);
          return 'reply';
        },
      }),
    );

    const session = await ExpoAI.createSession();
    await session.generate({ prompt: 'first' });
    await session.generate({ prompt: 'second' });

    expect(prompts[1]).toContain('first');
    expect(prompts[1]).toContain('reply');
    expect(prompts[1]).toContain('second');
  });

  it('reset() clears the transcript', async () => {
    const prompts: string[] = [];
    registerAdapter(
      createMockAdapter({
        provider: 'android-aicore-gemini-nano',
        respondWith: (prompt) => {
          prompts.push(prompt);
          return 'r';
        },
      }),
    );

    const session = await ExpoAI.createSession();
    await session.generate({ prompt: 'first' });
    await session.reset();
    await session.generate({ prompt: 'second' });

    expect(prompts[1]).not.toContain('first');
  });

  it('session.generateObject returns a validated object', async () => {
    registerAdapter(
      createMockAdapter({
        provider: 'android-aicore-gemini-nano',
        respondWith: '{"name":"Ada","age":36}',
      }),
    );
    const session = await ExpoAI.createSession();
    const obj = await session.generateObject<{ name: string; age: number }>({
      prompt: 'extract',
      schema: personSchema,
    });
    expect(obj).toEqual({ name: 'Ada', age: 36 });
  });

  it('backfills session-level sampling onto native session turns (per-call overrides)', async () => {
    const seen: Array<number | undefined> = [];
    const adapter = {
      provider: 'apple-foundation-models',
      async getAvailability() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      async getCapabilities() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      async generate() {
        return { text: 'g' };
      },
      async createSession() {
        return {
          id: 's1',
          provider: 'apple-foundation-models',
          async generate(req: { temperature?: number }) {
            seen.push(req.temperature);
            return { text: 'r' };
          },
          async reset() {},
          async dispose() {},
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const session = await ExpoAI.createSession({ temperature: 0.2 });
    await session.generate({ prompt: 'hi' }); // inherits 0.2
    await session.generate({ prompt: 'hi', temperature: 0.9 }); // per-call override
    expect(seen).toEqual([0.2, 0.9]);
  });

  it("does not pollute a native session's transcript with generateObject scaffolding", async () => {
    const sessionPrompts: string[] = [];
    const oneShotPrompts: string[] = [];
    const adapter = {
      provider: 'apple-foundation-models',
      async getAvailability() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      async getCapabilities() {
        return { available: true, provider: 'apple-foundation-models' };
      },
      // One-shot adapter generate returns schema-valid JSON.
      async generate(req: { prompt: string }) {
        oneShotPrompts.push(req.prompt);
        return { text: '{"name":"Ada","age":36}' };
      },
      // Native stateful session — no generateEphemeral / commitTurn (like Apple).
      async createSession() {
        return {
          id: 's1',
          provider: 'apple-foundation-models',
          async generate(req: { prompt: string }) {
            sessionPrompts.push(req.prompt);
            return { text: 'session-reply' };
          },
          async reset() {},
          async dispose() {},
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    registerAdapter(adapter);

    const session = await ExpoAI.createSession();
    const obj = await session.generateObject({ prompt: 'extract person', schema: personSchema });
    expect(obj).toEqual({ name: 'Ada', age: 36 });

    // generateObject ran off-session (no transcript turns), schema prompt went to the one-shot.
    expect(sessionPrompts).toEqual([]);
    expect(oneShotPrompts[0]).toContain('JSON Schema');

    // A subsequent real turn is the only thing in the transcript.
    await session.generate({ prompt: 'and their email?' });
    expect(sessionPrompts).toEqual(['and their email?']);
  });
});
