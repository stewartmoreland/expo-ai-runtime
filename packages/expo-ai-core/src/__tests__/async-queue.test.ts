import { describe, expect, it } from 'vitest';

import { AsyncQueue } from '../async-queue.js';

async function drain<T>(queue: AsyncQueue<T>, out: T[] = []): Promise<T[]> {
  for await (const value of queue) out.push(value);
  return out;
}

describe('AsyncQueue', () => {
  it('delivers pushed values then completes on close', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.close();
    expect(await drain(queue)).toEqual([1, 2]);
  });

  it('rejects on fail even when the error value is undefined', async () => {
    const queue = new AsyncQueue<number>();
    queue.fail(undefined);
    await expect(drain(queue)).rejects.toBeUndefined();
  });

  it('drains buffered values before rejecting with a defined error', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.fail(new Error('boom'));
    const out: number[] = [];
    await expect(drain(queue, out)).rejects.toThrow('boom');
    expect(out).toEqual([1]);
  });

  it('discards buffered values when fail(discardBuffered=true)', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.fail(new Error('cancelled'), true);
    const out: number[] = [];
    await expect(drain(queue, out)).rejects.toThrow('cancelled');
    expect(out).toEqual([]);
  });
});
