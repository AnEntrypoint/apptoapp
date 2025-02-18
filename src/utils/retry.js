const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 2, initialDelay = 10000) {
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

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error('[RetryWithBackoff] Unhandled error:', error.message);
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw lastError;
}

module.exports = {
  retryWithBackoff
}; 