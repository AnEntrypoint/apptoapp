const { createLLMProvider, MistralProvider, GroqProvider } = require('../llm/providers');

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

describe('createLLMProvider', () => {
  test('should create MistralProvider', () => {
    const provider = createLLMProvider('mistral', 'test-key');
    expect(provider).toBeInstanceOf(MistralProvider);
  });

  test('should create GroqProvider', () => {
    const provider = createLLMProvider('groq', 'test-key');
    expect(provider).toBeInstanceOf(GroqProvider);
  });

  test('should throw error for unsupported provider', () => {
    expect(() => createLLMProvider('unsupported', 'test-key')).toThrow('Unsupported LLM provider');
  });
});

describe('MistralProvider', () => {
  let provider;
  const mockApiKey = 'test-api-key';
  const mockFetch = jest.fn();

  beforeEach(() => {
    provider = new MistralProvider(mockApiKey);
    // Reset and re-mock fetch for each test
    jest.resetModules();
    jest.mock('node-fetch', () => mockFetch);
    mockFetch.mockReset();
  });

  test('should handle API errors gracefully', async () => {
    const messages = [{ role: 'user', content: 'test' }];
    
    // Mock a failed response
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({
        message: 'Unauthorized',
        request_id: 'test-request-id'
      })
    });

    await expect(provider.makeRequest(messages))
      .rejects
      .toThrow('API Error 401: Unauthorized');
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

  test('handles API errors gracefully', async () => {
    const messages = [
      { role: 'user', content: 'Hello' }
    ];

    provider.groq.chat.completions.create = jest.fn().mockRejectedValue(
      new Error('API Error')
    );

    await expect(provider.makeRequest(messages))
      .rejects
      .toThrow('API Error');
  });
}); 