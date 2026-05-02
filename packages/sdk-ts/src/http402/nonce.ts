/**
 * Nonce store implementations for different backends.
 */

export interface NonceRecord {
  expiresAt: number;
  paid: boolean;
}

export interface NonceStore {
  get(nonce: string): Promise<NonceRecord | null>;
  set(nonce: string, record: NonceRecord): Promise<void>;
  cleanup(): Promise<void>;
}

/** In-memory store — suitable for single-instance servers */
export class InMemoryNonceStore implements NonceStore {
  private map = new Map<string, NonceRecord>();

  async get(nonce: string): Promise<NonceRecord | null> {
    return this.map.get(nonce) ?? null;
  }

  async set(nonce: string, record: NonceRecord): Promise<void> {
    this.map.set(nonce, record);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, val] of this.map) {
      if (now > val.expiresAt + 60_000) {
        this.map.delete(key);
      }
    }
  }
}
