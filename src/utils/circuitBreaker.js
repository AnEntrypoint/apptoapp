const logger = require('./logger');
const metrics = require('./metrics');

const State = {
  CLOSED: 'CLOSED',      // Circuit is closed, requests flow normally
  OPEN: 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN: 'HALF_OPEN', // Circuit is testing if service is healthy
};

class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenLimit = options.halfOpenLimit || 1;
    this.monitorInterval = options.monitorInterval || 10000; // 10 seconds

    this.state = State.CLOSED;
    this.failures = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.monitorHandle = null;

    // Initialize metrics
    metrics.increment('circuit_breaker.created', 1, { name: this.name });
    this.startMonitoring();
  }

  /**
   * Start monitoring circuit state
   * @private
   */
  startMonitoring() {
    this.monitorHandle = setInterval(() => {
      this.updateMetrics();
      
      // Check if we should attempt reset
      if (this.state === State.OPEN && 
          this.lastFailureTime && 
          Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.toHalfOpen();
      }
    }, this.monitorInterval);

    // Prevent keeping process alive
    this.monitorHandle.unref();
  }

  /**
   * Update metrics for monitoring
   * @private
   */
  updateMetrics() {
    metrics.recordValue('circuit_breaker.failures', this.failures, { 
      name: this.name,
      state: this.state,
    });

    if (this.lastFailureTime) {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      metrics.recordValue('circuit_breaker.time_since_failure', timeSinceFailure, {
        name: this.name,
      });
    }

    metrics.recordValue('circuit_breaker.half_open_attempts', this.halfOpenAttempts, {
      name: this.name,
    });
  }

  /**
   * Record a successful operation
   * @private
   */
  recordSuccess() {
    if (this.state === State.HALF_OPEN) {
      this.toClosed();
    }
    this.failures = 0;
  }

  /**
   * Record a failed operation
   */
  recordFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.toOpen();
    }
  }

  /**
   * Check if circuit allows operation
   * @returns {boolean} Whether operation is allowed
   */
  isAllowed() {
    if (this.state === State.OPEN) {
      return false;
    }

    if (this.state === State.HALF_OPEN && this.halfOpenAttempts >= this.halfOpenLimit) {
      return false;
    }

    if (this.state === State.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    return true;
  }

  /**
   * Wrap an async function with circuit breaker
   * @param {Function} fn - Function to wrap
   * @returns {Function} - Protected function
   */
  wrap(fn) {
    return async (...args) => {
      metrics.increment('circuit_breaker.attempt', 1, { name: this.name });

      if (!this.isAllowed()) {
        metrics.increment('circuit_breaker.rejected', 1, { name: this.name });
        throw new Error(`Circuit breaker ${this.name} is ${this.state}`);
      }

      try {
        const result = await fn(...args);
        metrics.increment('circuit_breaker.success', 1, { name: this.name });
        this.recordSuccess();
        return result;
      } catch (error) {
        metrics.increment('circuit_breaker.failure', 1, { name: this.name });
        this.recordFailure();
        throw error;
      }
    };
  }

  /**
   * Get current circuit breaker state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
      metrics: {
        attempts: metrics.getValue('circuit_breaker.attempt', { name: this.name }),
        success: metrics.getValue('circuit_breaker.success', { name: this.name }),
        failure: metrics.getValue('circuit_breaker.failure', { name: this.name }),
        rejected: metrics.getValue('circuit_breaker.rejected', { name: this.name }),
        stateChanges: metrics.getValue('circuit_breaker.state_change', { name: this.name }),
      },
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.monitorHandle) {
      clearInterval(this.monitorHandle);
      this.monitorHandle = null;
    }
  }

  /**
// Create default instance for API calls
const apiBreaker = new CircuitBreaker({
  name: 'api',
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenLimit: 1,
});

module.exports = {
  CircuitBreaker,
  apiBreaker,
  State,
}; 