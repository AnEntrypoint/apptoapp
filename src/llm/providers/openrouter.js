const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');

class OpenRouterProvider extends BaseLLMProvider {
    constructor(apiKey, siteUrl = '', siteName = '') {
        super(apiKey);
        this.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        this.siteUrl = siteUrl;
        this.siteName = siteName;
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // Minimum 2 seconds between requests
        this.isTest = process.env.NODE_ENV === 'test';
        logger.info('Initialized OpenRouter provider');
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteName,
            'Content-Type': 'application/json'
        };
    }

    async makeRequest(messages, tools = []) {
        logger.info('Making OpenRouter API request');
        
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            logger.info(`Waiting ${waitTime}ms to respect rate limits`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
        
        const requestBody = {
            model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-r1:free',
            messages,
            temperature: 0.6,
            max_tokens: 32768,
            top_p: 0.95,
            stream: !this.isTest // Only stream in non-test environment
        };

        if (tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto';
        }

        this.logRequestDetails(messages, tools, requestBody);

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                logger.error('OpenRouter API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorData
                });
                
                if (response.status === 429) {
                    throw new Error('OpenRouter API rate limit exceeded');
                }
                
                throw new Error(`OpenRouter API Error ${response.status}: ${response.statusText}`);
            }

            if (this.isTest) {
                // In test environment, return the JSON response directly
                const jsonResponse = await response.json();
                return jsonResponse;
            }

            // In non-test environment, handle streaming response
            logger.info('OpenRouter API request successful, streaming response...');
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
                            let content = ''
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
            logger.error('OpenRouter API request failed:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = OpenRouterProvider; 