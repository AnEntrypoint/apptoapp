const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  console.log('[RetryWithBackoff] Starting retry operation');
  let delay = process.env.NODE_ENV === 'test' ? 100 : initialDelay;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[RetryWithBackoff] Attempt ${attempt}/${maxRetries}`);
    try {
      // Create an AbortController for this attempt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[RetryWithBackoff] Operation timed out, aborting');
        controller.abort();
      }, 60000); // 60 second timeout

      try {
        console.log('[RetryWithBackoff] Starting operation');
        const result = await operation();
        console.log('[RetryWithBackoff] Operation completed successfully');
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      lastError = error;
      
      // Log detailed error information
      console.error(`[RetryWithBackoff] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
        type: error.constructor.name,
        code: error.code,
        cause: error.cause,
        name: error.name,
        stack: error.stack
      });
      
      // Don't retry on authentication errors
      if (error.message.includes('401') || 
          error.message.toLowerCase().includes('invalid api key') ||
          error.message.toLowerCase().includes('unauthorized')) {
        console.error('[RetryWithBackoff] Authentication error:', error.message);
        throw error;
      }
      
      // Don't retry on invalid request errors
      if (error.message.includes('400') ||
          error.message.toLowerCase().includes('invalid request')) {
        console.error('[RetryWithBackoff] Invalid request error:', error.message);
        throw error;
      }
      
      if (attempt === maxRetries) {
        console.error(`[RetryWithBackoff] Failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      
      // Retry on rate limits, timeouts, and temporary errors
      if (error.message.includes('429') || 
          error.message.toLowerCase().includes('too many requests') ||
          error.message.toLowerCase().includes('timeout') ||
          error.message.toLowerCase().includes('econnreset') ||
          error.message.toLowerCase().includes('network error') ||
          error.message.toLowerCase().includes('aborted') ||
          error.name === 'AbortError') {
        console.warn(`[RetryWithBackoff] Retryable error on attempt ${attempt}/${maxRetries}:`, error.message);
        console.warn(`[RetryWithBackoff] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= process.env.NODE_ENV === 'test' ? 1.5 : 3;
        continue;
      }
      
      // Don't retry on other errors
      console.error('[RetryWithBackoff] Unhandled error:', error.message);
      throw error;
    }
  }
  
  throw lastError;
}

module.exports = {
  retryWithBackoff
}; 