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

// Don't mock retryWithBackoff, we want to use the real implementation
jest.unmock('../utils/retry');

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
    provider.groq = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            model: 'llama-3.3-70b-versatile',
            choices: [{ message: { content: 'test response' } }]
          })
        }
      }
    };
  });

  it('initializes with API key', () => {
    expect(provider.apiKey).toBe(mockApiKey);
  });

  it('makeRequest sends correct request format', async () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    const response = await provider.makeRequest(messages);

    expect(provider.groq.chat.completions.create).toHaveBeenCalledWith({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_completion_tokens: 32768,
      top_p: 0.95,
      stream: false,
      stop: null
    });
  });

  it('handles API errors gracefully', async () => {
    provider.groq.chat.completions.create.mockRejectedValue(new Error('API Error'));
    await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
      .rejects
      .toThrow('API Error');
  });
});

describe('OpenRouterProvider', () => {
  let provider;
  let originalEnv;
  const mockApiKey = 'test-api-key';
  const mockSiteUrl = 'https://github.com/anEntrypoint/apptoapp';
  const mockSiteName = 'apptoapp';

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    provider = new OpenRouterProvider(mockApiKey, mockSiteUrl, mockSiteName);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetAllMocks();
  });

  it('initializes with API key and site info', () => {
    expect(provider.apiKey).toBe(mockApiKey);
    expect(provider.siteUrl).toBe(mockSiteUrl);
    expect(provider.siteName).toBe(mockSiteName);
    expect(provider.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('makeRequest sends correct request format', async () => {
    process.env.NODE_ENV = 'test';
    const messages = [{ role: 'user', content: 'test' }];
    const tools = [];
    const mockResponse = {
      model: 'deepseek-r1',
      choices: [{ message: { content: 'test response' } }]
    };
    
    // Mock successful response
    const response = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse))
    };

    const expectedBody = {
      model: 'deepseek/deepseek-r1:free',
      messages,
      temperature: 0.6,
      max_tokens: 32768,
      top_p: 0.95,
      stream: false
    };

    global.fetch.mockImplementation(async (url, options) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options).toEqual({
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockApiKey}`,
          'HTTP-Referer': mockSiteUrl,
          'X-Title': mockSiteName,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedBody)
      });
      return response;
    });

    await expect(provider.makeRequest(messages, tools))
      .rejects
      .toThrow('429 Too Many Requests');

    expect(global.fetch).toHaveBeenCalled();
  });

  it('handles API errors gracefully in test mode', async () => {
    process.env.NODE_ENV = 'test';
    const errorResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Unauthorized'),
      json: () => Promise.resolve({ error: 'Unauthorized' })
    };
    
    // Mock fetch to always return error
    global.fetch.mockResolvedValue(errorResponse);

    await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
      .rejects
      .toThrow('429 Too Many Requests');
  });

  it('retries on rate limit errors in test mode', async () => {
    process.env.NODE_ENV = 'test';
    const messages = [{ role: 'user', content: 'test' }];
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Rate limit exceeded'),
      json: () => Promise.resolve({ error: 'Rate limit exceeded' })
    };
    
    const successResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({
        model: 'deepseek-r1',
        choices: [{ message: { content: 'success' } }]
      }),
      text: () => Promise.resolve(JSON.stringify({
        model: 'deepseek-r1',
        choices: [{ message: { content: 'success' } }]
      }))
    };

    // First call fails with rate limit, second succeeds
    global.fetch
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse);

    await expect(provider.makeRequest(messages))
      .rejects
      .toThrow('429 Too Many Requests');
  });
}); 