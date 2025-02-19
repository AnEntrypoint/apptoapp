const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');

class TogetherProvider extends BaseLLMProvider {
    constructor(apiKey) {
        super(apiKey);
        this.endpoint = 'https://api.together.xyz/v1/chat/completions';
        this.abortController = null;
        this.isTest = process.env.NODE_ENV === 'test';
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
            stop: [""],
            stream: !this.isTest
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

            if (this.isTest) {
                // In test environment, return the JSON response directly
                const jsonResponse = await response.json();
                return jsonResponse;
            }

            // In non-test environment, handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                
                chunk.split('\n').forEach(line => {
                    if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                        try {
                            let content = '';
                            try {
                                const message = JSON.parse(line.replace("data: ", ''));
                                content = message.choices[0].delta?.content;
                            } catch (e) {
                                logger.warn('Parse error:', e.message);
                            }
                            if (content) {
                                process.stdout.write(content);
                                fullResponse += content;
                            }
                        } catch (e) {
                            logger.warn('Parse error:', e.message);
                        }
                    }
                });
            }

            logger.info('Full response received');
            return {choices: [{message: {content: fullResponse}}]};
        } catch (error) {
            logger.error('Together API request failed:', error);
            throw error;
        }
    }
}

module.exports = TogetherProvider; 