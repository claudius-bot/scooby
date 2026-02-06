export class TtlCache<T> {
  private cache = new Map<string, { data: T; expiresAt: number }>();

  constructor(private opts: { ttlMs: number; maxEntries: number }) {}

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.opts.maxEntries) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { data: value, expiresAt: Date.now() + this.opts.ttlMs });
  }
}
