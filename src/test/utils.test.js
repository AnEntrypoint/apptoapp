const { sum, product, makeApiRequest } = require('../utils');
const { createLLMProvider } = require('../llm/providers');

jest.mock('../llm/providers');

describe('utils', () => {
  test('should return the sum of two numbers', () => {
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
  });

  test('should return the product of two numbers', () => {
    expect(product(2, 3)).toBe(6);
    expect(product(-2, 3)).toBe(-6);
    expect(product(0, 5)).toBe(0);
  });
});

describe('makeApiRequest', () => {
  const mockProvider = {
    makeRequest: jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: 'Test response'
        }
      }]
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createLLMProvider.mockReturnValue(mockProvider);
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  test('should use Groq by default', async () => {
    await makeApiRequest([{ content: 'test' }], [], 'test-key');
    expect(createLLMProvider).toHaveBeenCalledWith('groq', 'test-key');
  });

  test('should fall back to Mistral if Groq fails', async () => {
    createLLMProvider
      .mockImplementationOnce(() => { throw new Error('Groq failed'); })
      .mockImplementationOnce(() => mockProvider);

    await makeApiRequest([{ content: 'test' }], [], 'test-key');
    
    expect(createLLMProvider).toHaveBeenCalledTimes(2);
    expect(createLLMProvider).toHaveBeenNthCalledWith(1, 'groq', 'test-key');
    expect(createLLMProvider).toHaveBeenNthCalledWith(2, 'mistral', process.env.MISTRAL_API_KEY);
  });

  test('should handle API errors', async () => {
    mockProvider.makeRequest.mockRejectedValueOnce(new Error('API Error'));
    await expect(makeApiRequest([{ content: 'test' }], [], 'test-key')).rejects.toThrow('API Error');
  });
});
