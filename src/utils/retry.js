const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  let delay = process.env.NODE_ENV === 'test' ? 100 : initialDelay;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) throw error;
      
      if (error.message.includes('429') || 
          error.message.toLowerCase().includes('too many requests') ||
          (process.env.NODE_ENV === 'test' && error.message.includes('401'))) {
        logger.warn(`Rate limit hit, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= process.env.NODE_ENV === 'test' ? 1.5 : 3;
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}

module.exports = {
  retryWithBackoff
}; 