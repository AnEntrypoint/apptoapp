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
            max_tokens: null,
            top_p: 0.7,
            top_k: 50,
            repetition_penalty: 1,
            stop: ["<｜end▁of▁sentence｜>"],
            stream: true
        };

        try {
            this.logRequestDetails(messages, tools, requestBody);

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const responseData = await response.json();
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

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                process.stdout.write(chunk);
            }

            logger.info('Full response received');
            return fullResponse;
        } catch (error) {
            logger.error('Together API request failed:', error);
            throw error;
        }
    }
}

module.exports = TogetherProvider; 