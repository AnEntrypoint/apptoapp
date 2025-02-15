const logger = require('../utils/logger');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// Add retry helper at the top level
async function retryWithBackoff(operation, maxRetries = 5, initialDelay = 2000) {
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Only retry on rate limit errors
      if (error.message.includes('429') || error.message.toLowerCase().includes('too many requests')) {
        logger.warn(`Rate limit hit, attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 3; // More aggressive exponential backoff
      } else {
        throw error;
      }
    }
  }
}

class MistralProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.endpoint = 'https://codestral.mistral.ai/v1/chat/completions';
  }

  async makeRequest(messages, tools = []) {
    return retryWithBackoff(async () => {
      console.log('Making Mistral API request...');
      console.log('Request Endpoint:', this.endpoint);
      console.log('API Key:', `${this.apiKey?.slice(0, 5)}...${this.apiKey?.slice(-3)}`);

      const requestBody = {
        model: 'codestral-latest',
        messages,
        tool_choice: 'any',
        tools,
        stream: false,
      };

 
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      logger.debug('Mistral API Response:', responseText);

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText };
        }
        logger.error('Mistral API Error:', errorData);
        throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`);
      }

      return JSON.parse(responseText);
    });
  }
}

class CopilotClaudeProvider {
  constructor(apiKey) {
    this.token = apiKey;
    this.tokenPath = path.join(process.cwd(), '.copilot_token');
    this.clientId = 'Iv1.b507a08c87ecfe98';
  }

  async makeRequest(messages, tools = [], language = 'javascript') {
    return retryWithBackoff(async () => {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array must not be empty');
      }

      const lastMessage = messages[messages.length - 1];
      const systemMessage = messages.find(m => m.role === 'system');
      
      if (!lastMessage.content || typeof lastMessage.content !== 'string') {
        throw new Error('Message content must not be empty');
      }

      try {
        logger.info('Making Copilot completion request...');
        logger.debug('Request messages:', messages.map(m => ({ role: m.role, length: m.content?.length || 0 })));
        
        const threadId = crypto.randomUUID();
        const requestBody = {
          content: lastMessage.content,
          customInstructions: systemMessage?.content || '',
          model: 'claude-3.5-sonnet',
          mode: 'immersive',
          tools: tools
        };

        //logger.debug('API Request Body:', JSON.stringify(requestBody, null, 2));

        const response = await fetch(`https://api.individual.githubcopilot.com/github/chat/threads/${threadId}/messages`, {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'authorization': `GitHub-Bearer ${this.token}`,
            'content-type': 'text/event-stream',
            'copilot-integration-id': 'copilot-chat'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: errorText };
          }
          logger.error('Copilot API Error:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            error: errorData
          });
          throw new Error(`Copilot-Claude API error: ${errorData.error?.message || response.statusText}`);
        }

        const responseText = await response.text();
        let result = '';

        // Parse streaming response
        const lines = responseText.split('\n');
        let completionCount = 0;
        for (const line of lines) {
          if (line.startsWith('data: {')) {
            try {
              const jsonCompletion = JSON.parse(line.slice(6));
              const completion = jsonCompletion.choices[0]?.text;
              if (completion) {
                result += completion;
                completionCount++;
              } else {
                result += '\n';
              }
            } catch (error) {
              logger.error('Failed to parse completion line:', error);
            }
          }
        }
        
        logger.debug(`Processed ${completionCount} completion chunks`);
        logger.debug('Final result length:', result.length);

        return { choices: [{ message: { content: result } }] };
      } catch (error) {
        logger.error('API Request Failed:', {
          error: error.message,
          stack: error.stack,
          token: this.token ? `${this.token.slice(0, 5)}...${this.token.slice(-5)}` : 'no token'
        });
        throw error;
      }
    });
  }
}

function createLLMProvider(type, apiKey) {
  switch (type.toLowerCase()) {
    case 'mistral':
      return new MistralProvider(apiKey);
    case 'copilot-claude':
      return new CopilotClaudeProvider(apiKey);
    default:
      throw new Error(`Unsupported LLM provider: ${type}`);
  }
}

module.exports = {
  createLLMProvider,
  MistralProvider,
  CopilotClaudeProvider
};