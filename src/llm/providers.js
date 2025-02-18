const logger = require('../utils/logger');
const MistralProvider = require('./providers/mistral');
const GroqProvider = require('./providers/groq');
const OpenRouterProvider = require('./providers/openrouter');
const TogetherProvider = require('./providers/together');

function createLLMProvider(providerType, apiKey, endpoint) {
  logger.info(`Creating LLM provider of type: ${providerType}`);
  
  switch (providerType.toLowerCase()) {
    case 'mistral':
      return new MistralProvider(apiKey, endpoint);
    case 'groq':
      const groqKey = apiKey || process.env.GROQ_API_KEY;
      if (!groqKey) {
        throw new Error('No Groq API key provided');
      }
      logger.info('Initializing Groq provider');
      return new GroqProvider(groqKey);
    case 'openrouter':
      const openrouterKey = apiKey || process.env.OPENROUTER_API_KEY;
      if (!openrouterKey) {
        throw new Error('No OpenRouter API key provided');
      }
      logger.info('Initializing OpenRouter provider');
      return new OpenRouterProvider(
        openrouterKey,
        process.env.OPENROUTER_SITE_URL || 'https://github.com/anEntrypoint/apptoapp',
        process.env.OPENROUTER_SITE_NAME || 'apptoapp'
      );
    case 'together':
      const togetherKey = apiKey || process.env.TOGETHER_API_KEY;
      if (!togetherKey) {
        throw new Error('No Together API key provided');
      }
      return new TogetherProvider(togetherKey);
    default:
      throw new Error(`Unsupported LLM provider type: ${providerType}`);
  }
}

module.exports = {
  MistralProvider,
  GroqProvider,
  OpenRouterProvider,
  TogetherProvider,
  createLLMProvider
};