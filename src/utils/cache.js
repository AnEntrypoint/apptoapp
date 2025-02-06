const logger = require('./logger');
const metrics = require('./metrics');

class Cache {
  constructor(options = {}) {
    this.store = new Map();
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour in milliseconds
    this.maxSize = options.maxSize || 1000;
    this.name = options.name || 'default';

    // Initialize metrics
    metrics.increment('cache.created', 1, { name: this.name });
  }

  /**
   * Generate cache key from value and options
   * @private
   */
  generateKey(value, options = {}) {
    const normalized = typeof value === 'string' ? value : JSON.stringify(value);
    const optionsKey = Object.entries(options)
      .filter(([k]) => k !== 'ttl') // Exclude TTL from key generation
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return optionsKey ? `${normalized}[${optionsKey}]` : normalized;
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {Object} options - Cache options
   * @param {number} options.ttl - Time to live in milliseconds
   */
  set(key, value, options = {}) {
    metrics.increment('cache.set_attempts', 1, { name: this.name });
    
    const cacheKey = this.generateKey(key, options);
    const ttl = options.ttl || this.defaultTTL;
    const expiresAt = Date.now() + ttl;

    // Check if we're replacing an existing entry
    const existing = this.store.get(cacheKey);
    if (existing && existing.expiresAt <= Date.now()) {
      this.store.delete(cacheKey);
      metrics.increment('cache.evictions', 1, { 
        name: this.name,
        reason: 'expired',
      });
    }

    // Ensure we don't exceed max size
    if (this.store.size >= this.maxSize) {
      const evicted = this.evictExpired();
      
      // If still at max size, remove oldest entry
      if (this.store.size >= this.maxSize) {
        const oldestKey = Array.from(this.store.keys())[0];
        this.store.delete(oldestKey);
        metrics.increment('cache.evictions', 1, { 
          name: this.name,
          reason: 'size',
        });
      }
    }

    this.store.set(cacheKey, {
      value,
      expiresAt,
      createdAt: Date.now(),
      accessCount: 0,
    });

    metrics.increment('cache.sets', 1, { name: this.name });
    metrics.recordValue('cache.size', this.store.size, { name: this.name });

    logger.debug('Cache set', {
      key: cacheKey,
      ttl,
      cacheSize: this.store.size,
    });
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @param {Object} options - Cache options
   * @returns {*} Cached value or undefined
   */
  get(key, options = {}) {
    metrics.increment('cache.get_attempts', 1, { name: this.name });
    
    const cacheKey = this.generateKey(key, options);
    const entry = this.store.get(cacheKey);

    if (!entry) {
      metrics.increment('cache.misses', 1, { name: this.name });
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(cacheKey);
      metrics.increment('cache.evictions', 1, { 
        name: this.name,
        reason: 'expired',
      });
      metrics.increment('cache.misses', 1, { name: this.name });
      return undefined;
    }

    entry.accessCount++;
    metrics.increment('cache.hits', 1, { name: this.name });
    metrics.recordValue('cache.access_count', entry.accessCount, { name: this.name });

    const age = Date.now() - entry.createdAt;
    metrics.recordValue('cache.hit_age', age, { name: this.name });

    return entry.value;
  }

  /**
   * Remove expired entries from the cache
   * @private
   * @returns {number} Number of entries evicted
   */
  evictExpired() {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        metrics.increment('cache.evictions', 1, { 
          name: this.name,
          reason: 'expired',
        });
        evicted++;
      }
    }

    if (evicted > 0) {
      metrics.recordValue('cache.size', this.store.size, { name: this.name });
    }

    return evicted;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    // Evict expired entries before calculating stats
    this.evictExpired();

    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: metrics.getValue('cache.hits', { name: this.name }),
      misses: metrics.getValue('cache.misses', { name: this.name }),
      evictions: metrics.getValue('cache.evictions', { name: this.name }),
      hitRate: this.calculateHitRate(),
      ageStats: metrics.getStats('cache.hit_age', { name: this.name }),
      accessStats: metrics.getStats('cache.access_count', { name: this.name }),
    };
  }

  /**
   * Calculate cache hit rate
   * @private
   */
  calculateHitRate() {
    const hits = metrics.getValue('cache.hits', { name: this.name });
    const misses = metrics.getValue('cache.misses', { name: this.name });
    const total = hits + misses;
    return total > 0 ? hits / total : 0;
  }

  /**
   * Clear the cache
   */
  clear() {
    const size = this.store.size;
    if (size > 0) {
      this.store.clear();
      metrics.increment('cache.evictions', size, { 
        name: this.name,
        reason: 'clear',
      });
      metrics.recordValue('cache.size', 0, { name: this.name });
      logger.info('Cache cleared', { name: this.name, entriesCleared: size });
    }
  }
}

// Create default instance for API responses
const apiCache = new Cache({
  name: 'api',
  defaultTTL: 3600000, // 1 hour
  maxSize: 1000,
});

module.exports = {
  Cache,
  apiCache,
}; 