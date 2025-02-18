const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 3, initialDelay = 2000) {
  let delay = process.env.NODE_ENV === 'test' ? 100 : initialDelay;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[RetryWithBackoff] Attempt ${attempt}/${maxRetries}`);
    try {
      console.log('[RetryWithBackoff] Starting operation');
      const result = await operation();
      console.log('[RetryWithBackoff] Operation completed successfully');
      return result;
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
      
      // Don't retry on authentication errors or validation errors
      if (error.message.includes('401') || 
          error.message.toLowerCase().includes('invalid api key') ||
          error.message.toLowerCase().includes('unauthorized') ||
          error.message.includes('422')) {
        console.log('[RetryWithBackoff] Non-retryable error detected');
        throw error;
      }

      // Handle rate limiting with longer backoff
      if (error.message.includes('429') || 
          error.message.toLowerCase().includes('rate limit') ||
          error.message.toLowerCase().includes('too many requests')) {
        delay = delay * 3; // Triple the delay for rate limit errors
        console.log(`[RetryWithBackoff] Rate limit detected, increasing delay to ${delay}ms`);
      }

      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`[RetryWithBackoff] Waiting ${backoffDelay}ms before next attempt`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  console.error('[RetryWithBackoff] All retries failed:', lastError.message);
  throw lastError;
}

module.exports = {
  retryWithBackoff
}; 