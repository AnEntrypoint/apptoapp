const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  let delay = process.env.NODE_ENV === 'test' ? 100 : initialDelay;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to the operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Operation timed out'));
        }, 60000); // 60 second timeout
      });

      // Race between the operation and timeout
      return await Promise.race([
        operation(),
        timeoutPromise
      ]);
    } catch (error) {
      lastError = error;
      
      // Log detailed error information
      logger.error(`Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
        type: error.constructor.name,
        code: error.code,
        cause: error.cause
      });
      
      // Don't retry on authentication errors
      if (error.message.includes('401') || 
          error.message.toLowerCase().includes('invalid api key') ||
          error.message.toLowerCase().includes('unauthorized')) {
        logger.error('Authentication error:', error.message);
        throw error;
      }
      
      // Don't retry on invalid request errors
      if (error.message.includes('400') ||
          error.message.toLowerCase().includes('invalid request')) {
        logger.error('Invalid request error:', error.message);
        throw error;
      }
      
      if (attempt === maxRetries) {
        logger.error(`Failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }
      
      // Retry on rate limits, timeouts, and temporary errors
      if (error.message.includes('429') || 
          error.message.toLowerCase().includes('too many requests') ||
          error.message.toLowerCase().includes('timeout') ||
          error.message.toLowerCase().includes('econnreset') ||
          error.message.toLowerCase().includes('network error')) {
        logger.warn(`Retryable error on attempt ${attempt}/${maxRetries}:`, error.message);
        logger.warn(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= process.env.NODE_ENV === 'test' ? 1.5 : 3;
        continue;
      }
      
      // Don't retry on other errors
      logger.error('Unhandled error:', error.message);
      throw error;
    }
  }
  
  throw lastError;
}

module.exports = {
  retryWithBackoff
}; 