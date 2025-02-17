const { createLLMProvider, MistralProvider } = require('../llm/providers');

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

// Add this mock at the top
jest.mock('node-fetch', () => jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{
        message: {
          content: 'Test response',
          role: 'assistant'
        },
        finish_reason: 'stop'
      }],
      object: 'chat.completion',
      model: 'codestral-latest',
    })
  })
));

describe('LLM Providers', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset fetch mock
    global.fetch.mockReset();
    // Set default successful response
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'Test response',
              role: 'assistant'
            },
            finish_reason: 'stop'
          }],
          object: 'chat.completion',
          model: 'codestral-latest',
        })
      })
    );
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
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'Unauthorized' })
        })
      );
      
      await expect(provider.makeRequest([], [])).rejects.toThrow('API Error 401');
    });
  });

  describe('createLLMProvider', () => {
    test('should create MistralProvider', () => {
      const provider = createLLMProvider('mistral', 'test-key');
      expect(provider).toBeInstanceOf(MistralProvider);
    });

    test('should throw error for unsupported provider', () => {
      expect(() => createLLMProvider('unsupported', 'test-key')).toThrow('Unsupported LLM provider');
    });
  });
}); 