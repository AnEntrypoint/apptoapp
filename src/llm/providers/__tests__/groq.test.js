const GroqProvider = require('../groq');

jest.mock('../../../utils/logger');

describe('GroqProvider', () => {
    const mockApiKey = 'test-api-key';
    let provider;

    beforeEach(() => {
        provider = new GroqProvider(mockApiKey);
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('initializes with API key', () => {
        expect(provider.apiKey).toBe(mockApiKey);
        expect(provider.endpoint).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    test('throws error when no API key provided', () => {
        expect(() => new GroqProvider()).toThrow('API key is required');
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
                    'Content-Type': 'application/json'
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
            .toThrow('Groq API Error 400: Bad Request');
    });

    test('handles rate limit errors', async () => {
        const mockErrorResponse = {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            json: () => Promise.resolve({ error: 'Rate limit exceeded' })
        };

        global.fetch.mockResolvedValueOnce(mockErrorResponse);

        await expect(provider.makeRequest([{ role: 'user', content: 'test' }]))
            .rejects
            .toThrow('Groq API rate limit exceeded');
    });
}); 