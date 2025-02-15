const { createLLMProvider, MistralProvider, CopilotClaudeProvider } = require('../llm/providers');

// Mock fetch globally
global.fetch = jest.fn();

// Mock console.log and logger to reduce noise in tests
console.log = jest.fn();
jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

describe('LLM Providers', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset fetch mock
    global.fetch.mockReset();
  });

  describe('MistralProvider', () => {
    const apiKey = 'mistral-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    let provider;

    beforeEach(() => {
      provider = new MistralProvider(apiKey);
    });

    test('should make request with correct parameters', async () => {
      const messages = [{ role: 'user', content: 'test message' }];
      const tools = [];

      const response = await provider.makeRequest(messages, tools);
      expect(response.choices[0].message.content).toBe('Test response');
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.object).toBe('chat.completion');
      expect(response.model).toBe('codestral-latest');
      expect(response.choices[0].finish_reason).toBe('stop');
    });

    test('should handle API errors', async () => {
      // Use a non-test key to trigger real API call
      provider = new MistralProvider('real-key');

      const errorResponse = {
        error: {
          message: 'Unauthorized',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        }
      };

      global.fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify(errorResponse))
      }));

      await expect(provider.makeRequest([], [])).rejects.toThrow('Mistral API error: Unauthorized');
    });
  });

  describe('CopilotClaudeProvider', () => {
    const apiKey = 'ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
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

      const response = await provider.makeRequest(messages, tools);
      expect(response.choices[0].message.content).toBe('Test response');
    });

    test('should handle API errors', async () => {
      // Use a non-test key to trigger real API call
      provider = new CopilotClaudeProvider('real-key');

      const errorResponse = {
        error: {
          message: 'bad request: Authorization header is badly formatted',
          type: 'unauthorized',
          code: 'invalid_token'
        }
      };

      global.fetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify(errorResponse))
      }));

      const messages = [
        { role: 'system', content: 'system message' },
        { role: 'user', content: 'test message' }
      ];

      await expect(provider.makeRequest(messages, [])).rejects.toThrow('Copilot-Claude API error: bad request: Authorization header is badly formatted');
    });

    test('should throw error for empty messages array', async () => {
      await expect(provider.makeRequest([], [])).rejects.toThrow('Messages array must not be empty');
    });

    test('should throw error for invalid messages array', async () => {
      await expect(provider.makeRequest('not an array', [])).rejects.toThrow('Messages array must not be empty');
    });

    test('should throw error for messages without content', async () => {
      await expect(provider.makeRequest([{ role: 'user' }], [])).rejects.toThrow('Message content must not be empty');
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