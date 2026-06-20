/**
 * A minimal push/pull async queue used to bridge callback-style native stream
 * events into an `AsyncIterable`. Producers `push`, then `close` (normal end)
 * or `fail` (error end). Consumers `for await` over it; a failed queue throws
 * the stored error from the iterator.
 *
 * Single-consumer: iterate exactly once. The instance holds shared state, so two
 * concurrent consumers would destructively split the values between them; create
 * a new queue per consumer instead.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failed = false;
  private error: unknown;

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.values.push(value);
    }
  }

  /** Normal completion: no more values will be pushed. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter.resolve({ value: undefined, done: true });
      waiter = this.waiters.shift();
    }
  }

  /**
   * Error completion: the iterator rejects with `error`. By default already-
   * buffered values drain first; pass `discardBuffered` to drop them and reject
   * immediately (used for cancellation, so no further content is emitted).
   */
  fail(error: unknown, discardBuffered = false): void {
    if (this.closed) return;
    if (discardBuffered) this.values.length = 0;
    this.error = error;
    this.failed = true;
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter.reject(error);
      waiter = this.waiters.shift();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.values.length > 0) {
          const value = this.values.shift() as T;
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          if (this.failed) return Promise.reject(this.error);
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}
