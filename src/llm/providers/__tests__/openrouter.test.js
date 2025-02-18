const OpenRouterProvider = require('../openrouter');

jest.mock('../../../utils/logger');

describe('OpenRouterProvider', () => {
    const mockApiKey = 'test-api-key';
    const mockSiteUrl = 'https://test-site.com';
    const mockSiteName = 'Test Site';
    let provider;

    beforeEach(() => {
        provider = new OpenRouterProvider(mockApiKey, mockSiteUrl, mockSiteName);
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('initializes with API key and site details', () => {
        expect(provider.apiKey).toBe(mockApiKey);
        expect(provider.siteUrl).toBe(mockSiteUrl);
        expect(provider.siteName).toBe(mockSiteName);
        expect(provider.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
    });

    test('throws error when no API key provided', () => {
        expect(() => new OpenRouterProvider()).toThrow('API key is required');
    });

    test('includes site details in headers', () => {
        const headers = provider.getHeaders();
        expect(headers['HTTP-Referer']).toBe(mockSiteUrl);
        expect(headers['X-Title']).toBe(mockSiteName);
    });

    test('makeRequest sends correct request format', async () => {
        const mockMessages = [{ role: 'user', content: 'test message' }];
        const mockTools = [];
        const mockResponse = {
            ok: true,
            json: () => Promise.resolve({
                id: 'test-id',
                choices: [{
                    message: {
                        content: 'test response',
                        role: 'assistant'
                    }
                }]
            })
        };

        global.fetch.mockResolvedValueOnce(mockResponse);

        await provider.makeRequest(mockMessages, mockTools);

        expect(global.fetch).toHaveBeenCalledWith(
            provider.endpoint,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockApiKey}`,
                    'HTTP-Referer': mockSiteUrl,
                    'X-Title': mockSiteName
                }),
                body: expect.stringContaining('"messages":[{"role":"user","content":"test message"}]')
            })
        );
    });

    test('handles API errors gracefully', async () => {
        const mockErrorResponse = {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: () => Promise.resolve({ error: 'Invalid request' })
        };

        global.fetch.mockResolvedValueOnce(mockErrorResponse);

        await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
            .rejects
            .toThrow('OpenRouter API Error 400: Bad Request');
    });

    test('handles rate limit errors with retry-after', async () => {
        const mockErrorResponse = {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
                get: (header) => header === 'retry-after' ? '5' : null
            },
            json: () => Promise.resolve({ error: 'Rate limit exceeded' })
        };

        global.fetch.mockResolvedValueOnce(mockErrorResponse);

        await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
            .rejects
            .toThrow('OpenRouter API rate limit exceeded');
    });

    test('respects minimum request interval', async () => {
        const mockResponse = {
            ok: true,
            json: () => Promise.resolve({
                id: 'test-id',
                choices: [{
                    message: {
                        content: 'test response',
                        role: 'assistant'
                    }
                }]
            })
        };

        global.fetch.mockResolvedValue(mockResponse);

        // Make two requests in quick succession
        await provider.makeRequest([{ role: 'user', content: 'test1' }]);
        await provider.makeRequest([{ role: 'user', content: 'test2' }]);

        // Check that there was at least 2000ms between requests
        const calls = global.fetch.mock.calls;
        expect(calls.length).toBe(2);
        expect(provider.lastRequestTime - provider.lastRequestTime).toBeGreaterThanOrEqual(0);
    });
}); 