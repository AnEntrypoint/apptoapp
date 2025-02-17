const { createLLMProvider, MistralProvider, GroqProvider } = require('../llm/providers');

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
    let provider;
    const mockApiKey = 'test-api-key';

    beforeEach(() => {
      provider = new MistralProvider(mockApiKey);
      global.fetch.mockReset();
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
      const messages = [{ role: 'user', content: 'test' }];
      
      // Mock a failed response that will fail all retries
      global.fetch.mockImplementation(() => {
        throw new Error('API Error');
      });

      await expect(provider.makeRequest(messages)).rejects.toThrow('API Error');
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

  describe('GroqProvider', () => {
    let provider;
    const mockApiKey = 'test-api-key';

    beforeEach(() => {
      provider = new GroqProvider(mockApiKey);
    });

    test('initializes with API key', () => {
      expect(provider.apiKey).toBe(mockApiKey);
      expect(provider.groq).toBeDefined();
    });

    test('makeRequest sends correct request format', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const mockResponse = {
        model: 'deepseek-r1-distill-llama-70b',
        choices: [{
          message: {
            content: 'Test response',
            role: 'assistant'
          },
          finish_reason: 'stop'
        }]
      };

      provider.groq.chat.completions.create = jest.fn().mockResolvedValue(mockResponse);

      const response = await provider.makeRequest(messages);

      expect(provider.groq.chat.completions.create).toHaveBeenCalledWith({
        messages,
        model: 'deepseek-r1-distill-llama-70b',
        temperature: 0.6,
        max_completion_tokens: 131072,
        top_p: 0.95,
        stream: false,
        stop: null
      });

      expect(response).toEqual(mockResponse);
    });

    test('handles API errors correctly', async () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const mockError = new Error('API Error');
      provider.groq.chat.completions.create = jest.fn().mockRejectedValue(mockError);

      await expect(provider.makeRequest(messages)).rejects.toThrow('API Error');
    });
  });
}); 