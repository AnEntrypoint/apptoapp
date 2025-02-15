const { createLLMProvider, MistralProvider, CopilotClaudeProvider } = require('../llm/providers');

// Mock fetch globally
global.fetch = jest.fn();

describe('LLM Providers', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Mock successful response
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: 'Test response'
          }
        }]
      }),
      text: () => Promise.resolve('data: {"type":"text","text":"Test response"}\n')
    });
  });

  describe('MistralProvider', () => {
    const apiKey = 'test-mistral-key';
    let provider;

    beforeEach(() => {
      provider = new MistralProvider(apiKey);
    });

    test('should make request with correct parameters', async () => {
      const messages = [{ role: 'user', content: 'test message' }];
      const tools = [];

      await provider.makeRequest(messages, tools);

      expect(fetch).toHaveBeenCalledWith(
        'https://codestral.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody).toEqual({
        model: 'codestral-latest',
        messages,
        tool_choice: 'any',
        tools,
        stream: false,
      });
    });

    test('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'API Error' })
      });

      await expect(provider.makeRequest([], [])).rejects.toThrow('Mistral API error');
    });
  });

  describe('CopilotClaudeProvider', () => {
    const apiKey = 'test-copilot-key';
    let provider;

    beforeEach(() => {
      provider = new CopilotClaudeProvider(apiKey);
    });

    test('should make request with correct parameters', async () => {
      const messages = [
        { role: 'system', content: 'system message' },
        { role: 'user', content: 'test message' }
      ];
      const tools = [];

      await provider.makeRequest(messages, tools);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/api\.individual\.githubcopilot\.com\/github\/chat\/threads\/.*\/messages$/),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'accept': '*/*',
            'authorization': `GitHub-Bearer ${apiKey}`,
            'content-type': 'text/event-stream',
            'copilot-integration-id': 'copilot-chat'
          },
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody).toMatchObject({
        content: 'test message',
        customInstructions: 'system message',
        model: 'claude-3.5-sonnet',
        mode: 'immersive',
        tools: tools,
      });
    });

    test('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('API Error')
      });

      await expect(provider.makeRequest([], [])).rejects.toThrow('Copilot-Claude API error');
    });
  });

  describe('createLLMProvider', () => {
    test('should create MistralProvider', () => {
      const provider = createLLMProvider('mistral', 'test-key');
      expect(provider).toBeInstanceOf(MistralProvider);
    });

    test('should create CopilotClaudeProvider', () => {
      const provider = createLLMProvider('copilot-claude', 'test-key');
      expect(provider).toBeInstanceOf(CopilotClaudeProvider);
    });

    test('should throw error for unsupported provider', () => {
      expect(() => createLLMProvider('unsupported', 'test-key')).toThrow('Unsupported LLM provider');
    });
  });
}); 