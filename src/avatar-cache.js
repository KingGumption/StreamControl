// Shared process-local cache. Never persists viewer images or authorization.
class AvatarCache {
  constructor({ maxEntries = 1000, maxBytes = Infinity, ttlMs = 6 * 60 * 60 * 1000, now = Date.now } = {}) {
    Object.assign(this, { maxEntries, maxBytes, ttlMs, now });
    this.entries = new Map();
    this.pending = new Map();
    this.bytes = 0;
  }
  remove(key) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.size;
    this.entries.delete(key);
  }
  async get(key, load) {
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= this.now()) this.remove(id);
    }
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.value;
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = Promise.resolve().then(load).then(value => {
      const size = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value || '');
      if (value && size <= this.maxBytes) {
        this.entries.set(key, { value, size, expiresAt: this.now() + this.ttlMs });
        this.bytes += size;
        while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
          this.remove(this.entries.keys().next().value);
        }
      }
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
const avatarImages = new AvatarCache({ maxEntries: 256, maxBytes: 32 * 1024 * 1024 });
module.exports = { AvatarCache, avatarImages };
