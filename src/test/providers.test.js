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
  const mockApiKey = 'test-api-key';
  const mockSiteUrl = 'https://test.com';
  const mockSiteName = 'Test Site';

  beforeEach(() => {
    provider = new OpenRouterProvider(mockApiKey, mockSiteUrl, mockSiteName);
    global.fetch = jest.fn();
    process.env.NODE_ENV = 'test'; // Ensure we're in test mode
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    delete process.env.NODE_ENV;
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
    const mockResponse = {
      model: 'deepseek-r1',
      choices: [{ message: { content: 'test response' } }]
    };
    
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(JSON.stringify(mockResponse))
    });

    const response = await provider.makeRequest(messages, tools);
    expect(response).toEqual(mockResponse);

    const expectedBody = {
      model: 'deepseek/deepseek-r1:free',
      messages,
      temperature: 0.6,
      max_tokens: 32768,
      top_p: 0.95,
      stream: false
    };

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockApiKey}`,
          'HTTP-Referer': mockSiteUrl,
          'X-Title': mockSiteName,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expectedBody)
      }
    );
  });

  it('handles API errors gracefully', async () => {
    const errorResponse = {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key')
    };
    global.fetch.mockImplementationOnce(() => Promise.resolve(errorResponse));

    await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
      .rejects
      .toThrow('API Error 401');
  });

  it('retries on rate limit errors', async () => {
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

    global.fetch
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse);

    const responsePromise = provider.makeRequest(messages);
    
    // Fast-forward through all timers
    jest.runAllTimers();

    const response = await responsePromise;
    expect(response.choices[0].message.content).toBe('success');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
}); 