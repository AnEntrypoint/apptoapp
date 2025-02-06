const logger = require('./logger');
const sleep = require('./sleep');
const config = require('../config');

/**
 * Implements exponential backoff retry logic
 * @param {Function} operation - The async operation to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts
 * @param {number} options.baseDelay - Base delay in milliseconds
 * @param {number} options.maxDelay - Maximum delay in milliseconds
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 * @returns {Promise} - The result of the operation
 */
async function withRetry(operation, {
  maxRetries = config.tasks.maxRetries,
  baseDelay = config.tasks.retryDelay,
  maxDelay = config.tasks.timeout,
  shouldRetry = (error) => {
    // Default retry conditions
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'RATE_LIMIT',
      'TOO_MANY_REQUESTS',
    ];
    return retryableErrors.includes(error.code) || error.status === 429;
  },
} = {}) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!shouldRetry(error) || attempt > maxRetries) {
        logger.error('Operation failed permanently', {
          error: error.message,
          attempt,
          maxRetries,
        });
        throw error;
      }

      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelay
      );

      logger.warn('Operation failed, retrying', {
        error: error.message,
        attempt,
        delay,
        maxRetries,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = {
  withRetry,
}; 