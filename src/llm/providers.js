const logger = require('../utils/logger');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');

async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      if (error.message.includes('429') || error.message.toLowerCase().includes('too many requests')) {
        logger.warn(`Rate limit hit, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 3;
      } else {
        throw error;
      }
    }
  }
}

class MistralProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.endpoint = process.env.MISTRAL_CHAT_ENDPOINT || 'https://codestral.mistral.ai/v1/chat/completions';
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json'
    };
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('Making Mistral API request to:', this.endpoint);

      const requestBody = {
        model: process.env.MISTRAL_MODEL || 'codestral-latest',
        messages,
        tool_choice: tools.length ? 'any' : 'none',
        tools: tools.length ? tools : undefined,
        stream: false,
      };

      try {
        console.log('Sending request with headers:', {
          ...this.headers,
          'Authorization': 'Bearer *****' + this.apiKey.slice(-4)
        });

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
          const responseText = await response.text();
          console.error('API Error:', {
            status: response.status,
            bodyPreview: responseText.slice(0, 200)
          });
          throw new Error(`API Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('API Response:', {
          messageId: data.id,
          contentLength: data.choices[0]?.message?.content?.length || 0
        });
        return data;

      } catch (error) {
        console.error('Request failed:', error);
        throw error;
      }
    });
  }
}

class GroqProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.groq = new Groq({
      apiKey: this.apiKey
    });
    console.log('Initialized Groq provider');
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('Making Groq API request');
      
      try {
        const requestBody = {
          messages,
          model: process.env.GROQ_MODEL || 'deepseek-r1-distill-llama-70b',
          temperature: 0.6,
          max_completion_tokens: 131072,
          top_p: 0.95,
          stream: false,
          stop: null
        };

        console.log('Sending request to Groq:', {
          model: requestBody.model,
          messageCount: messages.length
        });

        const chatCompletion = await this.groq.chat.completions.create(requestBody);

        console.log('Groq API Response:', {
          model: chatCompletion.model,
          contentLength: chatCompletion.choices[0]?.message?.content?.length || 0
        });

        return chatCompletion;
      } catch (error) {
        console.error('Groq request failed:', error.message);
        throw error;
      }
    });
  }
}

function createLLMProvider(providerType, apiKey) {
  if (!['mistral', 'copilot', 'groq'].includes(providerType)) {
    throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
  
  if (providerType === 'groq') {
    console.log('Initializing Groq provider');
    return new GroqProvider(apiKey || process.env.GROQ_API_KEY);
  }
  
  console.log('Initializing Mistral provider');
  return new MistralProvider(apiKey || process.env.MISTRAL_API_KEY);
}

module.exports = {
  createLLMProvider,
  MistralProvider,
  GroqProvider
};