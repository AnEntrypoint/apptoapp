const { createLLMProvider, MistralProvider, GroqProvider, OpenRouterProvider } = require('../llm/providers');

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
  it('should create MistralProvider', () => {
    const provider = createLLMProvider('mistral', 'test-key');
    expect(provider).toBeInstanceOf(MistralProvider);
  });

  it('should create GroqProvider', () => {
    const provider = createLLMProvider('groq', 'test-key');
    expect(provider).toBeInstanceOf(GroqProvider);
  });

  it('should create OpenRouterProvider', () => {
    const provider = createLLMProvider('openrouter', 'test-key');
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it('should throw error for unsupported provider', () => {
    expect(() => createLLMProvider('unsupported')).toThrow('Unsupported LLM provider');
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

describe('OpenRouterProvider', () => {
  let provider;
  const mockApiKey = 'test-api-key';
  const mockSiteUrl = 'https://test.com';
  const mockSiteName = 'Test Site';

  beforeEach(() => {
    provider = new OpenRouterProvider(mockApiKey, mockSiteUrl, mockSiteName);
  });

  it('initializes with API key and site info', () => {
    expect(provider.apiKey).toBe(mockApiKey);
    expect(provider.siteUrl).toBe(mockSiteUrl);
    expect(provider.siteName).toBe(mockSiteName);
    expect(provider.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('makeRequest sends correct request format', async () => {
    const messages = [{ role: 'user', content: 'test' }];
    const tools = [];
    
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        model: 'deepseek-r1',
        choices: [{ message: { content: 'test response' } }]
      })
    });

    await provider.makeRequest(messages, tools);

    expect(global.fetch).toHaveBeenCalledWith(
      provider.endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': `Bearer ${mockApiKey}`,
          'HTTP-Referer': mockSiteUrl,
          'X-Title': mockSiteName
        }),
        body: expect.stringContaining('"model":"deepseek/deepseek-r1:free"')
      })
    );
  });

  it('handles API errors gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key')
    });

    await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
      .rejects
      .toThrow('API Error 401');
  });
}); 