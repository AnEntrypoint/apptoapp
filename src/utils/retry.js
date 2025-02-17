const logger = require('./logger');

async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  let delay = process.env.NODE_ENV === 'test' ? 100 : initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      if (error.message.includes('429') || error.message.toLowerCase().includes('too many requests')) {
        logger.warn(`Rate limit hit, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= process.env.NODE_ENV === 'test' ? 1.5 : 3;
      } else {
        throw error;
      }
    }
  }
}

module.exports = {
  retryWithBackoff
}; 