const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');

class TogetherProvider extends BaseLLMProvider {
    constructor(apiKey) {
        super(apiKey);
        this.endpoint = 'https://api.together.xyz/v1/chat/completions';
        this.abortController = null;
    }

    async makeRequest(messages, tools = []) {
            this.abortController = new AbortController();
            
            const requestBody = {
                model: process.env.TOGETHER_MODEL || 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
                messages: messages,
                temperature: 0.7,
                max_tokens: 32768,
                top_p: 0.95,
                stream: false
            };

            try {
                this.logRequestDetails(messages, tools, requestBody);

                const response = await fetch(this.endpoint, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(requestBody),
                    signal: this.abortController.signal
                });

                let responseData;
                try {
                    responseData = await response.json();
                    logger.info('Together API raw response:', JSON.stringify(responseData, null, 2));
                } catch (e) {
                    logger.error('Error parsing Together API response:', e);
                    throw new Error('Failed to parse Together API response: ' + e.message);
                }

                if (!response.ok) {
                    logger.error('Together API Error:', {
                        status: response.status,
                        statusText: response.statusText,
                        body: responseData
                    });

                    if (response.status === 429) {
                        throw new Error('Together API rate limit exceeded');
                    }
                    if (response.status === 413) {
                        throw new Error('Request too large for Together API');
                    }
                    if (response.status === 401) {
                        throw new Error('Invalid Together API key');
                    }
                    if (response.status === 422) {
                        logger.error('Together API request validation failed:', responseData);
                        throw new Error(`Together API request validation failed: ${JSON.stringify(responseData.error || responseData)}`);
                    }

                    throw new Error(`Together API Error ${response.status}: ${response.statusText}`);
                }

                if (!responseData?.choices?.[0]?.message?.content) {
                    logger.error('Invalid Together API response format:', responseData);
                    throw new Error('Invalid response format from Together API');
                }

                return {
                    id: responseData.id,
                    choices: [{
                        message: responseData.choices[0].message
                    }]
                };
            } catch (error) {
                logger.error('Together API request failed:', error);
                throw error;
            }
    }
}

module.exports = TogetherProvider; 