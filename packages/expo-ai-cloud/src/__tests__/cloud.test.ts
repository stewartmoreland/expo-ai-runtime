import { beforeEach, describe, expect, it } from 'vitest';

import { ExpoAI, clearAdapters, type GenerateChunk } from '@stewmore/expo-ai-core';

import { configureCloud } from '../index.js';

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sseResponse(events: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeEach(() => clearAdapters());

describe('CloudAdapter via ExpoAI', () => {
  it('generates text and tags privacy as third-party-cloud', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ text: 'cloud reply', finishReason: 'stop' })) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });

    const result = await ExpoAI.generate({ prompt: 'hi', provider: 'cloud' });
    expect(result.text).toBe('cloud reply');
    expect(result.provider).toBe('cloud');
    expect(result.privacy.privacyMode).toBe('third-party-cloud');
    expect(result.privacy.sendsPromptOffDevice).toBe(true);
  });

  it('sends the schema for generateObject and parses the JSON reply', async () => {
    let receivedBody: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      receivedBody = JSON.parse(init.body as string);
      return jsonResponse({ text: '{"ok":true}' });
    }) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });

    const obj = await ExpoAI.generateObject({
      prompt: 'x',
      provider: 'cloud',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
    });
    expect(obj).toEqual({ ok: true });
    expect(receivedBody.schema).toBeTruthy();
  });

  it('parses SSE streaming deltas into chunks', async () => {
    const events = [
      'data: {"type":"delta","text":"Hello "}\n\n',
      'data: {"type":"delta","text":"world"}\n\n',
      'data: {"type":"done","text":"Hello world","finishReason":"stop"}\n\n',
      'data: [DONE]\n\n',
    ];
    const fetchImpl = (async () => sseResponse(events)) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });

    const chunks: GenerateChunk[] = [];
    for await (const chunk of ExpoAI.stream({ prompt: 'hi', provider: 'cloud' }))
      chunks.push(chunk);

    const deltas = chunks.flatMap((c) => (c.type === 'delta' ? [c.text] : [])).join('');
    expect(deltas).toBe('Hello world');
    const done = chunks.find((c) => c.type === 'done');
    expect(done && done.type === 'done' ? done.result.text : '').toBe('Hello world');
  });

  it('maps a 429 response to RATE_LIMITED', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ message: 'slow down' }, 429)) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });

    await expect(ExpoAI.generate({ prompt: 'hi', provider: 'cloud' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('forwards the abort signal to fetch on generate', async () => {
    let received: RequestInit | undefined;
    const controller = new AbortController();
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      received = init;
      return jsonResponse({ text: 'ok' });
    }) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });

    await ExpoAI.generate({ prompt: 'hi', provider: 'cloud', signal: controller.signal });
    expect(received?.signal).toBe(controller.signal);
  });

  async function streamText(): Promise<{ deltas: string; result?: string }> {
    const chunks: GenerateChunk[] = [];
    for await (const chunk of ExpoAI.stream({ prompt: 'hi', provider: 'cloud' }))
      chunks.push(chunk);
    const done = chunks.find((c) => c.type === 'done');
    return {
      deltas: chunks.flatMap((c) => (c.type === 'delta' ? [c.text] : [])).join(''),
      result: done && done.type === 'done' ? done.result.text : undefined,
    };
  }

  it('parses CRLF-delimited SSE events', async () => {
    const events = [
      'data: {"type":"delta","text":"Hello "}\r\n\r\n',
      'data: {"type":"delta","text":"world"}\r\n\r\n',
      'data: {"type":"done","text":"Hello world","finishReason":"stop"}\r\n\r\n',
      'data: [DONE]\r\n\r\n',
    ];
    configureCloud({
      endpoint: 'http://x',
      fetch: (async () => sseResponse(events)) as unknown as typeof fetch,
    });
    expect((await streamText()).deltas).toBe('Hello world');
  });

  it('keeps streamed deltas as the result text even when done text diverges', async () => {
    const events = [
      'data: {"type":"delta","text":"Hello  world"}\n\n',
      'data: {"type":"done","text":"Hello world"}\n\n',
      'data: [DONE]\n\n',
    ];
    configureCloud({
      endpoint: 'http://x',
      fetch: (async () => sseResponse(events)) as unknown as typeof fetch,
    });
    expect((await streamText()).result).toBe('Hello  world');
  });

  it('surfaces a mid-stream error event as a thrown error', async () => {
    const events = [
      'data: {"type":"delta","text":"part"}\n\n',
      'data: {"type":"error","code":"RATE_LIMITED","message":"slow down"}\n\n',
      'data: [DONE]\n\n',
    ];
    configureCloud({
      endpoint: 'http://x',
      fetch: (async () => sseResponse(events)) as unknown as typeof fetch,
    });
    await expect(streamText()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('errors on a stream that ends with no content and no terminator', async () => {
    configureCloud({
      endpoint: 'http://x',
      fetch: (async () => sseResponse([])) as unknown as typeof fetch,
    });
    await expect(streamText()).rejects.toBeTruthy();
  });

  it('maps an unknown upstream error code via HTTP status', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { code: 'rate_limit_exceeded', message: 'slow' },
        429,
      )) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });
    await expect(ExpoAI.generate({ prompt: 'hi', provider: 'cloud' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('passes through a known ExpoAIErrorCode from the backend', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ code: 'SAFETY_BLOCKED', message: 'blocked' }, 400)) as unknown as typeof fetch;
    configureCloud({ endpoint: 'http://x', fetch: fetchImpl });
    await expect(ExpoAI.generate({ prompt: 'hi', provider: 'cloud' })).rejects.toMatchObject({
      code: 'SAFETY_BLOCKED',
    });
  });
});
