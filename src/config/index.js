const path = require('path');
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',

  // Server configuration
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',

  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.MAX_TOKENS, 10) || 2000,
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    directory: path.join(process.cwd(), 'logs'),
  },

  // Task management configuration
  tasks: {
    maxRetries: parseInt(process.env.TASK_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.TASK_RETRY_DELAY, 10) || 1000,
    timeout: parseInt(process.env.TASK_TIMEOUT, 10) || 30000,
  },

  // Testing configuration
  testing: {
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
    timeout: parseInt(process.env.TEST_TIMEOUT, 10) || 5000,
  },
};

// Validate required configuration
const validateConfig = () => {
  const required = ['OPENAI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

validateConfig();

module.exports = config;
