const MistralProvider = require('../mistral');

jest.mock('../../../utils/logger');

describe('MistralProvider', () => {
    const mockApiKey = 'test-api-key';
    const mockEndpoint = 'https://test-endpoint.com';
    let provider;

    beforeEach(() => {
        provider = new MistralProvider(mockApiKey, mockEndpoint);
        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('initializes with API key and endpoint', () => {
        expect(provider.apiKey).toBe(mockApiKey);
        expect(provider.endpoint).toBe(mockEndpoint);
    });

    test('throws error when no API key provided', () => {
        expect(() => new MistralProvider()).toThrow('API key is required');
    });

    test('uses default endpoint when none provided', () => {
        const defaultProvider = new MistralProvider(mockApiKey);
        expect(defaultProvider.endpoint).toBe('https://codestral.mistral.ai/v1/chat/completions');
    });

    test('makeRequest sends correct request format', async () => {
        const mockMessages = [{ role: 'user', content: 'test message' }];
        const mockTools = [];
        const mockResponse = {
            ok: true,
            body: {
                getReader: () => ({
                    read: jest.fn().mockResolvedValueOnce({
                        done: true,
                        value: undefined
                    })
                })
            }
        };

        global.fetch.mockResolvedValueOnce(mockResponse);

        await provider.makeRequest(mockMessages, mockTools);

        expect(global.fetch).toHaveBeenCalledWith(
            mockEndpoint,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mockApiKey}`,
                    'Accept': 'application/json'
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
            .toThrow('Mistral API Error 400: Bad Request');
    });
}); 