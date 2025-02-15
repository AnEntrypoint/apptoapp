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

      logger.debug('Mistral API Request Body:', JSON.stringify(requestBody, null, 2));

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
  constructor() {
    this.token = null;
    this.tokenPath = path.join(process.cwd(), '.copilot_token');
    this.clientId = 'Iv1.b507a08c87ecfe98';
    this.setupTokenRefresh();
  }

  async setupTokenRefresh() {
    await this.ensureToken();
    // Refresh token every 25 minutes
    setInterval(() => this.ensureToken(), 25 * 60 * 1000);
  }

  async ensureToken() {
    try {
      await this.loadToken();
    } catch (error) {
      await this.authenticate();
    }

    if (!this.token || this.isTokenExpired()) {
      await this.refreshToken();
    }
  }

  async loadToken() {
    try {
      const token = await fs.readFile(this.tokenPath, 'utf8');
      this.token = token.trim();
      logger.debug('Loaded existing Copilot token');
    } catch (error) {
      logger.debug('No existing Copilot token found');
      throw error;
    }
  }

  isTokenExpired() {
    if (!this.token) return true;
    const pairs = this.token.split(';');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key.trim() === 'exp') {
        return parseInt(value.trim()) <= Math.floor(Date.now() / 1000);
      }
    }
    return true;
  }

  async authenticate() {
    logger.info('Starting Copilot authentication...');
    
    const deviceCodeResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'editor-version': 'Neovim/0.6.1',
        'editor-plugin-version': 'copilot.vim/1.16.0',
        'content-type': 'application/json',
        'user-agent': 'GithubCopilot/1.155.0',
        'accept-encoding': 'gzip,deflate,br'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        scope: 'read:user'
      })
    });

    const deviceData = await deviceCodeResp.json();
    
    logger.info(`Please visit ${deviceData.verification_uri} and enter code ${deviceData.user_code} to authenticate.`);

    let tokenData;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5 seconds * 60)

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts += 1;
      
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'editor-version': 'Neovim/0.6.1',
          'editor-plugin-version': 'copilot.vim/1.16.0',
          'content-type': 'application/json',
          'user-agent': 'GithubCopilot/1.155.0',
          'accept-encoding': 'gzip,deflate,br'
        },
        body: JSON.stringify({
          client_id: this.clientId,
          device_code: deviceData.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      tokenData = await tokenResp.json();
      
      if (tokenData.access_token) {
        await fs.writeFile(this.tokenPath, tokenData.access_token);
        this.token = tokenData.access_token;
        logger.info('Copilot authentication successful!');
        break;
      }
    }

    if (!tokenData?.access_token) {
      throw new Error('Authentication timeout - please try again');
    }
  }

  async refreshToken() {
    logger.debug('Refreshing Copilot token...');
    
    const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'authorization': `token ${this.token}`,
        'editor-version': 'Neovim/0.6.1',
        'editor-plugin-version': 'copilot.vim/1.16.0',
        'user-agent': 'GithubCopilot/1.155.0'
      }
    });

    const data = await resp.json();
    if (data.token) {
      this.token = data.token;
      await fs.writeFile(this.tokenPath, this.token);
      logger.debug('Copilot token refreshed successfully');
    } else {
      throw new Error('Failed to refresh Copilot token');
    }
  }

  async makeRequest(messages, tools = [], language = 'javascript') {
    return retryWithBackoff(async () => {
      await this.ensureToken();
      
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array must not be empty');
      }

      const lastMessage = messages[messages.length - 1];
      if (!lastMessage.content || typeof lastMessage.content !== 'string') {
        throw new Error('Message content must not be empty');
      }

      try {
        logger.info('Making Copilot completion request...');
        logger.debug('Request messages:', messages.map(m => ({ role: m.role, length: m.content?.length || 0 })));
        
        const requestBody = {
          prompt: lastMessage.content,
          suffix: '',
          max_tokens: 1000,
          temperature: 0,
          top_p: 1,
          n: 1,
          stop: ['\n'],
          nwo: 'github/copilot.vim',
          stream: true,
          extra: {
            language
          }
        };

        logger.debug('API Request Body:', JSON.stringify(requestBody, null, 2));

        const response = await fetch('https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${this.token}`,
            'content-type': 'application/json',
            'editor-version': 'Neovim/0.6.1',
            'editor-plugin-version': 'copilot.vim/1.16.0',
            'user-agent': 'GithubCopilot/1.155.0'
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
          throw new Error(`API Error ${response.status}: ${errorData.error?.message || response.statusText}`);
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
      return new CopilotClaudeProvider();
    default:
      throw new Error(`Unsupported LLM provider: ${type}`);
  }
}

module.exports = {
  createLLMProvider,
  MistralProvider,
  CopilotClaudeProvider
};