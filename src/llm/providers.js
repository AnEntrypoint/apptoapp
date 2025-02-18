const logger = require('../utils/logger');
const fetch = require('node-fetch');
const Groq = require('groq-sdk');
const { retryWithBackoff } = require('../utils/retry');

class MistralProvider {
  constructor(apiKey, endpoint) {
    if (!apiKey) {
      console.error('[MistralProvider] No API key provided');
      throw new Error('Mistral API key is required');
    }
    this.apiKey = apiKey;
    this.endpoint = endpoint || process.env.MISTRAL_CHAT_ENDPOINT || 'https://codestral.mistral.ai/v1/chat/completions';
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json'
    };
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('[MistralProvider] Retry attempt start');
      console.log('[MistralProvider] Making request to:', this.endpoint);

      const requestBody = {
        model: process.env.MISTRAL_MODEL || 'codestral-latest',
        messages,
        tool_choice: tools.length ? 'any' : 'none',
        tools: tools.length ? tools : undefined,
        stream: false,
      };

      try {
        console.log('[MistralProvider] Request headers:', {
          ...this.headers,
          'Authorization': 'Bearer *****' + this.apiKey.slice(-4)
        });

        console.log('[MistralProvider] Request body:', {
          model: requestBody.model,
          messageCount: messages.length,
          toolCount: tools.length,
          firstMessagePreview: messages[0]?.content?.slice(0, 100) + '...',
          messageTypes: messages.map(m => m.role).join(', '),
          totalContentLength: messages.reduce((acc, m) => acc + (m.content?.length || 0), 0)
        });

        console.log('[MistralProvider] Initiating fetch request');
        const response = await Promise.race([
          fetch(this.endpoint, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify(requestBody)
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out after 5 minutes')), 5 * 60 * 1000))
        ]);
        console.log('[MistralProvider] Response status:', response.status);

        let responseText;
        try {
          responseText = await response.text();
          console.log('[MistralProvider] Response text length:', responseText.length);
          console.log('[MistralProvider] Response text preview:', responseText.slice(0, 200) + '...');
        } catch (e) {
          console.error('[MistralProvider] Error reading response text:', e);
          console.error('[MistralProvider] Error stack:', e.stack);
          throw new Error('Failed to read response text: ' + e.message);
        }

        if (!response.ok) {
          console.error('[MistralProvider] API Error:', {
            status: response.status,
            statusText: response.statusText,
            bodyPreview: responseText.slice(0, 200),
            headers: Object.fromEntries([...response.headers.entries()])
          });

          // Handle specific error cases
          if (response.status === 401) {
            console.error('[MistralProvider] Authentication error');
            throw new Error('Invalid Mistral API key');
          }
          if (response.status === 429) {
            console.error('[MistralProvider] Rate limit error');
            throw new Error('Mistral API rate limit exceeded');
          }
          if (response.status === 400) {
            console.error('[MistralProvider] Bad request error');
            throw new Error('Invalid request to Mistral API: ' + responseText);
          }
          if (response.status === 500) {
            console.error('[MistralProvider] Server error');
            throw new Error('Mistral API server error: ' + responseText);
          }
          if (response.status === 503) {
            console.error('[MistralProvider] Service unavailable');
            throw new Error('Mistral API service unavailable: ' + responseText);
          }
          
          console.error('[MistralProvider] Unhandled API error');
          throw new Error(`Mistral API Error ${response.status}: ${response.statusText}\nResponse: ${responseText}`);
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('[MistralProvider] JSON parse error:', e);
          console.error('[MistralProvider] Failed JSON:', responseText);
          throw new Error('Invalid JSON response from Mistral API: ' + responseText);
        }

        if (!data?.choices?.[0]?.message?.content) {
          console.error('[MistralProvider] Invalid response format:', data);
          throw new Error('Invalid response format from Mistral API');
        }

        console.log('[MistralProvider] Response validation:', {
          hasId: !!data.id,
          hasChoices: !!data.choices,
          choicesLength: data.choices?.length,
          hasMessage: !!data.choices?.[0]?.message,
          hasContent: !!data.choices?.[0]?.message?.content,
          contentLength: data.choices?.[0]?.message?.content?.length
        });

        console.log('[MistralProvider] Request successful');
        return data;

      } catch (error) {
        console.error('[MistralProvider] Request failed:', {
          message: error.message,
          stack: error.stack,
          cause: error.cause,
          name: error.name,
          code: error.code
        });

        // For network or timeout errors, throw a retryable error
        if (error.message.includes('ECONNRESET') || 
            error.message.includes('timeout') ||
            error.message.includes('network error') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ECONNREFUSED')) {
          console.warn('[MistralProvider] Network/timeout error, will retry');
          throw new Error('Temporary network error: ' + error.message);
        }

        // For response parsing errors
        if (error.message.includes('JSON')) {
          console.error('[MistralProvider] JSON parsing error');
          throw new Error('Failed to parse Mistral API response: ' + error.message);
        }

        console.error('[MistralProvider] Unhandled error, rethrowing');
        throw error;
      }
    });
  }
}

class GroqProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Groq API key is required');
    }
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
        // Truncate messages if they're too long
        const truncatedMessages = messages.map(msg => ({
          ...msg,
          content: msg.content.length > 4000 ? msg.content.slice(0, 4000) + '...' : msg.content
        }));

        const requestBody = {
          messages: truncatedMessages,
          model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
          temperature: 0.6,
          max_tokens: 32768,
          top_p: 0.95,
          stream: false,
          stop: null
        };

        if (tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = 'auto';
        }

        console.log('Sending request to Groq:', {
          model: requestBody.model,
          messageCount: messages.length,
          toolCount: tools.length
        });

        const chatCompletion = await this.groq.chat.completions.create(requestBody);

        if (!chatCompletion?.choices?.[0]?.message?.content) {
          console.error('Invalid response from Groq:', chatCompletion);
          throw new Error('Invalid response format from Groq API');
        }

        console.log('Groq API Response:', {
          model: chatCompletion.model,
          contentLength: chatCompletion.choices[0].message.content.length
        });

        return {
          id: chatCompletion.id,
          choices: [{
            message: chatCompletion.choices[0].message
          }]
        };
      } catch (error) {
        console.error('Groq request failed:', error.message);
        
        // Check for specific error types
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
          throw new Error('Invalid Groq API key');
        }
        if (error.message.includes('429') || error.message.includes('rate_limit_exceeded')) {
          throw new Error('Groq API rate limit exceeded');
        }
        if (error.message.includes('413') || error.message.includes('Request too large')) {
          throw new Error('Request too large for Groq API');
        }
        if (error.message.includes('model not found')) {
          throw new Error(`Model ${process.env.GROQ_MODEL || 'mixtral-8x7b-32768'} not found`);
        }
        if (error.message.includes('invalid request')) {
          throw new Error('Invalid request to Groq API: ' + error.message);
        }
        
        // For network or timeout errors, throw a retryable error
        if (error.message.includes('ECONNRESET') || 
            error.message.includes('timeout') ||
            error.message.includes('network error')) {
          throw new Error('Temporary network error: ' + error.message);
        }
        
        // For unknown errors, include more details
        throw new Error('Groq API error: ' + error.message);
      }
    });
  }
}

class OpenRouterProvider {
  constructor(apiKey, siteUrl = '', siteName = '') {
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    this.apiKey = apiKey;
    this.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    this.siteUrl = siteUrl;
    this.siteName = siteName;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
      'Content-Type': 'application/json'
    };
    console.log('Initialized OpenRouter provider');
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('Making OpenRouter API request');
      
      try {
        const requestBody = {
          model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-coder-33b-instruct',
          messages,
          temperature: 0.6,
          max_tokens: 32768,
          top_p: 0.95,
          stream: false
        };

        if (tools.length > 0) {
          requestBody.tools = tools;
          requestBody.tool_choice = 'auto';
        }

        console.log('Sending request to OpenRouter:', {
          model: requestBody.model,
          messageCount: messages.length,
          toolCount: tools.length
        });

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(requestBody)
        });

        let responseData;
        try {
          responseData = await response.json();
          console.log('Response data after json():', responseData);
        } catch (e) {
          console.error('Error parsing response:', e);
          throw new Error('Failed to parse OpenRouter API response: ' + e.message);
        }

        if (!response.ok) {
          console.error('OpenRouter API Error:', {
            status: response.status,
            bodyPreview: JSON.stringify(responseData).slice(0, 200)
          });

          if (response.status === 429) {
            throw new Error('OpenRouter API rate limit exceeded');
          }
          if (response.status === 413) {
            throw new Error('Request too large for OpenRouter API');
          }
          if (response.status === 401) {
            throw new Error('Invalid OpenRouter API key');
          }

          throw new Error(`OpenRouter API Error ${response.status}: ${response.statusText}`);
        }

        if (!responseData?.choices?.[0]?.message?.content) {
          console.error('Invalid response data:', responseData);
          throw new Error('Invalid response format from OpenRouter API');
        }

        return {
          id: responseData.id,
          choices: [{
            message: responseData.choices[0].message
          }]
        };
      } catch (error) {
        console.error('OpenRouter request failed:', error.message);
        throw error;
      }
    });
  }
}

class TogetherProvider {
  constructor(apiKey) {
    if (!apiKey) throw new Error('Together API key is required');
    this.apiKey = apiKey;
    this.endpoint = 'https://api.together.xyz/v1/chat/completions';
    this.abortController = new AbortController();
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('Making Together API request');
      const requestBody = {
        model: process.env.TOGETHER_MODEL || 'deepseek-coder-33b-instruct',
        messages,
        temperature: 0.6,
        max_tokens: 32768,
        top_p: 0.95,
        stream: false
      };

      try {
        console.log('Sending request to Together:', {
          model: requestBody.model,
          messageCount: messages.length,
          toolCount: tools.length
        });

        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: this.abortController.signal
        });

        let responseData;
        try {
          responseData = await response.json();
          console.log('Response data after json():', responseData);
        } catch (e) {
          console.error('Error parsing response:', e);
          throw new Error('Failed to parse Together API response: ' + e.message);
        }

        if (!response.ok) {
          console.error('Together API Error:', {
            status: response.status,
            bodyPreview: JSON.stringify(responseData).slice(0, 200)
          });

          if (response.status === 429) {
            throw new Error('Together API rate limit exceeded');
          }
          if (response.status === 413) {
            throw new Error('Request too large for Together API');
          }
          if (response.status === 401) {
            throw new Error('Invalid Together API key');
          }

          throw new Error(`Together API Error ${response.status}: ${response.statusText}`);
        }

        if (!responseData?.choices?.[0]?.message?.content) {
          console.error('Invalid response data:', responseData);
          throw new Error('Invalid response format from Together API');
        }

        return {
          id: responseData.id,
          choices: [{
            message: responseData.choices[0].message
          }]
        };
      } catch (error) {
        console.error('Together request failed:', error.message);
        throw error;
      } finally {
        this.abortController.abort();
      }
    });
  }
}

function createLLMProvider(providerType, apiKey, endpoint) {
  if (!['mistral', 'copilot', 'groq', 'openrouter', 'together'].includes(providerType)) {
    throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
  
  if (providerType === 'groq') {
    const groqKey = apiKey || process.env.GROQ_API_KEY;
    if (!groqKey) {
      throw new Error('No Groq API key provided');
    }
    console.log('Initializing Groq provider');
    return new GroqProvider(groqKey);
  }

  if (providerType === 'openrouter') {
    const openrouterKey = apiKey || process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) {
      throw new Error('No OpenRouter API key provided');
    }
    console.log('Initializing OpenRouter provider');
    return new OpenRouterProvider(
      openrouterKey,
      process.env.OPENROUTER_SITE_URL || 'https://github.com/anEntrypoint/apptoapp',
      process.env.OPENROUTER_SITE_NAME || 'apptoapp'
    );
  }
  
  if (providerType === 'together') {
    const togetherKey = apiKey || process.env.TOGETHER_API_KEY;
    if (!togetherKey) {
      throw new Error('No Together API key provided');
    }
    return new TogetherProvider(togetherKey);
  }
  
  const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
  if (!mistralKey) {
    throw new Error('No Mistral API key provided');
  }
  console.log('Initializing Mistral provider with endpoint:', endpoint);
  return new MistralProvider(mistralKey, endpoint);
}

module.exports = {
  createLLMProvider,
  MistralProvider,
  GroqProvider,
  OpenRouterProvider,
  TogetherProvider
};