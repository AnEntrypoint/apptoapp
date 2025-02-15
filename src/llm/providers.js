const logger = require('../utils/logger');
const crypto = require('crypto');

class MistralProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.endpoint = 'https://codestral.mistral.ai/v1/chat/completions';
  }

  async makeRequest(messages, tools = []) {
    console.log('Making Mistral API request...');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'codestral-latest',
        messages,
        tool_choice: 'any',
        tools,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Mistral API Error:', error);
      throw new Error(`Mistral API error: ${error.message || response.statusText}`);
    }

    const responseData = await response.json();
    return responseData;
  }
}

class CopilotClaudeProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.endpoint = 'https://api.individual.githubcopilot.com/github/chat/threads';
  }

  async makeRequest(messages, tools = []) {
    console.log('Making Copilot-Claude API request...');
    // Generate a unique thread ID and message ID
    const threadId = crypto.randomUUID();
    const messageId = crypto.randomUUID();

    const response = await fetch(`${this.endpoint}/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'authorization': `GitHub-Bearer ${this.apiKey}`,
        'content-type': 'text/event-stream',
        'copilot-integration-id': 'copilot-chat'
      },
      body: JSON.stringify({
        responseMessageID: messageId,
        content: messages[messages.length - 1].content,
        intent: 'conversation',
        references: [],
        context: [],
        currentURL: `https://github.com/copilot/c/${threadId}`,
        streaming: true,
        confirmations: [],
        customInstructions: messages[0].content,
        model: 'claude-3.5-sonnet',
        mode: 'immersive',
        customCopilotID: null,
        parentMessageID: '',
        tools: tools,
        mediaContent: []
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Copilot-Claude API Error:', error);
      throw new Error(`Copilot-Claude API error: ${error || response.statusText}`);
    }

    const text = await response.text();
    // Parse the SSE response to get the actual content
    const responseContent = text.split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.slice(6)))
      .filter(msg => msg.type === 'text')
      .map(msg => msg.text)
      .join('');

    return {
      choices: [{
        message: {
          content: responseContent
        }
      }]
    };
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