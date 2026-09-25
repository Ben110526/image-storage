/**
 * Async Mutex Queue for serializing operations across I/O yield points in Durable Objects
 */
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let releaseLock: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = this.queue;
    this.queue = this.queue.then(() => lockAcquired);

    await previousLock;
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  }
}
