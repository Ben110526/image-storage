/** Count server sessions, not just running requests: paused/error sessions still reserve quota. */
export class UploadQueueSlots {
  private readonly held = new Set<string>();
  private readonly started = new Set<string>();
  private readonly limit: number;

  constructor(limit = 5) {
    this.limit = limit;
  }

  take<T extends { id: string; status: string }>(items: readonly T[]): T[] {
    const ready: T[] = [];
    for (const item of items) {
      if (this.held.size >= this.limit) break;
      if (item.status !== 'pending' || this.started.has(item.id)) continue;
      this.held.add(item.id);
      this.started.add(item.id);
      ready.push(item);
    }
    return ready;
  }

  release(id: string): void {
    this.held.delete(id);
  }

  remove(id: string): void {
    // Also fence queued items against a stale render starting them after removal.
    this.started.add(id);
    this.release(id);
  }
}
