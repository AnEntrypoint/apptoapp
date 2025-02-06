const logger = require('./logger');
const metrics = require('./metrics');

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 20;
    this.interval = options.interval || 60000; // 1 minute in milliseconds
    this.tokens = this.maxRequests;
    this.lastRefill = Date.now();
    this.queue = [];
    this.processing = false;
    this.refillTimeout = null;
    this.name = options.name || 'default';

    // Initialize metrics
    metrics.increment(`rate_limiter.created`, 1, { name: this.name });
  }

  refillTokens() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;

    if (timePassed >= this.interval) {
      const oldTokens = this.tokens;
      this.tokens = this.maxRequests;
      this.lastRefill = now;

      metrics.increment(`rate_limiter.tokens_refilled`, this.maxRequests - oldTokens, {
        name: this.name,
      });
      return true;
    }
    return false;
  }

  scheduleRefill() {
    if (this.refillTimeout) {
      clearTimeout(this.refillTimeout);
    }

    const timeUntilRefill = this.interval - (Date.now() - this.lastRefill);
    this.refillTimeout = setTimeout(() => {
      this.refillTokens();
      this.processQueue();
    }, timeUntilRefill);
  }

  async acquire() {
    metrics.increment(`rate_limiter.acquire_attempts`, 1, { name: this.name });
    metrics.recordValue(`rate_limiter.tokens_available`, this.tokens, { name: this.name });
    metrics.recordValue(`rate_limiter.queue_length`, this.queue.length, { name: this.name });

    const acquireTimer = `rate_limiter.acquire_duration`;
    metrics.startTimer(acquireTimer, { name: this.name });

    try {
      this.refillTokens();

      if (this.tokens > 0) {
        this.tokens--;
        metrics.increment(`rate_limiter.tokens_used`, 1, { name: this.name });
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const queueItem = {
          resolve,
          reject,
          enqueuedAt: Date.now(),
          timeout: setTimeout(() => {
            const index = this.queue.findIndex(item => item === queueItem);
            if (index !== -1) {
              this.queue.splice(index, 1);
              metrics.increment(`rate_limiter.timeouts`, 1, { name: this.name });
              reject(new Error('Rate limit timeout'));
            }
          }, this.interval),
        };

        metrics.increment(`rate_limiter.requests_queued`, 1, { name: this.name });
        this.queue.push(queueItem);
        this.scheduleRefill();
      });
    } finally {
      metrics.stopTimer(acquireTimer, { name: this.name });
    }
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0 || this.tokens === 0) {
      return;
    }

    this.processing = true;
    metrics.startTimer(`rate_limiter.queue_processing`, { name: this.name });

    try {
      while (this.queue.length > 0 && this.tokens > 0) {
        const { resolve, timeout, enqueuedAt } = this.queue.shift();
        clearTimeout(timeout);
        this.tokens--;

        const waitTime = Date.now() - enqueuedAt;
        metrics.recordValue(`rate_limiter.queue_wait_time`, waitTime, { name: this.name });
        metrics.increment(`rate_limiter.requests_dequeued`, 1, { name: this.name });

        resolve();
      }

      if (this.queue.length > 0) {
        this.scheduleRefill();
      }
    } finally {
      this.processing = false;
      metrics.stopTimer(`rate_limiter.queue_processing`, { name: this.name });
    }
  }

  /**
   * Wraps an async function with rate limiting
   * @param {Function} fn - The function to rate limit
   * @returns {Function} - Rate limited function
   */
  wrap(fn) {
    return async (...args) => {
      try {
        await this.acquire();

        metrics.startTimer(`rate_limiter.execution`, { name: this.name });
        const result = await fn(...args);
        metrics.stopTimer(`rate_limiter.execution`, { name: this.name });

        metrics.increment(`rate_limiter.success`, 1, { name: this.name });
        return result;
      } catch (error) {
        metrics.increment(`rate_limiter.errors`, 1, {
          name: this.name,
          error: error.message,
        });

        if (error.message === 'Rate limit timeout') {
          logger.warn('Rate limit exceeded, request timed out', {
            queue: this.queue.length,
            tokens: this.tokens,
            name: this.name,
          });
        }
        throw error;
      }
    };
  }

  /**
   * Get current metrics for this rate limiter
   */
  getMetrics() {
    return {
      tokens: this.tokens,
      queueLength: this.queue.length,
      waitTime: metrics.getStats(`rate_limiter.queue_wait_time`, { name: this.name }),
      executionTime: metrics.getStats(`rate_limiter.execution`, { name: this.name }),
      timeouts: metrics.getValue(`rate_limiter.timeouts`, { name: this.name }),
      success: metrics.getValue(`rate_limiter.success`, { name: this.name }),
      errors: metrics.getValue(`rate_limiter.errors`, { name: this.name }),
    };
  }
}

// Create default instance for OpenAI API
const openAiLimiter = new RateLimiter({
  name: 'openai',
  maxRequests: 20,  // Adjust based on your API tier
  interval: 60000,  // 1 minute
});

module.exports = {
  RateLimiter,
  openAiLimiter,
};
