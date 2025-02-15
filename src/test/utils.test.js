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
  });

  test('should use Mistral by default', async () => {
    await makeApiRequest([], [], 'test-key', 'test-endpoint');
    expect(createLLMProvider).toHaveBeenCalledWith('mistral', 'test-key');
  });

  test('should use Copilot-Claude when specified', async () => {
    process.env.COPILOT_CLAUDE_KEY = 'test-copilot-key';
    await makeApiRequest([], [], 'test-key', 'test-endpoint', 'copilot-claude');
    expect(createLLMProvider).toHaveBeenCalledWith('copilot-claude', 'test-copilot-key');
    delete process.env.COPILOT_CLAUDE_KEY;
  });

  test('should use Copilot-Claude when env var is set regardless of model param', async () => {
    process.env.COPILOT_CLAUDE_KEY = 'test-copilot-key';
    await makeApiRequest([], [], 'test-key', 'test-endpoint', 'mistral');
    expect(createLLMProvider).toHaveBeenCalledWith('copilot-claude', 'test-copilot-key');
    delete process.env.COPILOT_CLAUDE_KEY;
  });

  test('should handle API errors', async () => {
    mockProvider.makeRequest.mockRejectedValueOnce(new Error('API Error'));
    await expect(makeApiRequest([], [], 'test-key', 'test-endpoint')).rejects.toThrow('API Error');
  });
});
