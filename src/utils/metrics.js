const logger = require('./logger');

class Metrics {
  constructor() {
    this.metrics = new Map();
    this.histograms = new Map();
    this.startTimes = new Map();
  }

  /**
   * Increment a counter metric
   * @param {string} name - Metric name
   * @param {number} value - Value to increment by
   * @param {Object} tags - Metric tags
   */
  increment(name, value = 1, tags = {}) {
    const key = this.getKey(name, tags);
    const current = this.metrics.get(key) || 0;
    const newValue = current + value;
    this.metrics.set(key, newValue);
    
    logger.debug('Metric incremented', {
      metric: name,
      key,
      value,
      tags,
      current,
      newValue,
      allMetrics: Object.fromEntries(this.metrics),
    });
  }

  /**
   * Record a value in a histogram
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {Object} tags - Metric tags
   */
  recordValue(name, value, tags = {}) {
    const key = this.getKey(name, tags);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
    
    // Keep only last 1000 values
    const values = this.histograms.get(key);
    if (values.length > 1000) {
      values.shift();
    }

    logger.debug('Value recorded', {
      histogram: name,
      value,
      tags,
    });
  }

  /**
   * Start timing an operation
   * @param {string} name - Timer name
   * @param {Object} tags - Metric tags
   */
  startTimer(name, tags = {}) {
    const key = this.getKey(name, tags);
    this.startTimes.set(key, process.hrtime());
    
    logger.debug('Timer started', {
      timer: name,
      tags,
    });
  }

  /**
   * Stop timing an operation and record duration
   * @param {string} name - Timer name
   * @param {Object} tags - Metric tags
   * @returns {number} Duration in milliseconds
   */
  stopTimer(name, tags = {}) {
    const key = this.getKey(name, tags);
    const startTime = this.startTimes.get(key);
    
    if (!startTime) {
      logger.warn('Timer stopped without start', {
        timer: name,
        tags,
      });
      return 0;
    }

    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;
    
    this.recordValue(`${name}_duration`, duration, tags);
    this.startTimes.delete(key);

    logger.debug('Timer stopped', {
      timer: name,
      duration,
      tags,
    });

    return duration;
  }

  /**
   * Get statistics for a histogram
   * @param {string} name - Histogram name
   * @param {Object} tags - Metric tags
   * @returns {Object} Statistics object
   */
  getStats(name, tags = {}) {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key) || [];
    
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p95: sorted[p95Index],
    };
  }

  /**
   * Get the current value of a counter
   * @param {string} name - Counter name
   * @param {Object} tags - Metric tags
   * @returns {number} Current value
   */
  getValue(name, tags = {}) {
    const key = this.getKey(name, tags);
    const value = this.metrics.get(key) || 0;
    
    logger.debug('Metric value retrieved', {
      metric: name,
      key,
      tags,
      value,
      allMetrics: Object.fromEntries(this.metrics),
    });
    
    return value;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.histograms.clear();
    this.startTimes.clear();
    logger.info('Metrics reset');
  }

  /**
   * Get a unique key for a metric
   * @private
   */
  getKey(name, tags) {
    const sortedTags = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    const key = sortedTags ? `${name}[${sortedTags}]` : name;
    logger.debug('Generated metric key', { name, tags, key });
    return key;
  }
}

// Create default instance
const metrics = new Metrics();

module.exports = metrics; 