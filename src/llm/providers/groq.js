const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');

class GroqProvider extends BaseLLMProvider {
    constructor(apiKey) {
        super(apiKey);
        this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        this.isTest = process.env.NODE_ENV === 'test';
    }

    async makeRequest(messages, tools = []) {
        logger.info('Making Groq API request');
        
        const requestBody = {
            model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
            messages,
            temperature: 0.7,
            max_tokens: 32768,
            top_p: 0.95,
            stream: !this.isTest
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
                logger.error('Groq API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorData
                });
                
                if (response.status === 429) {
                    throw new Error('Groq API rate limit exceeded');
                }
                
                throw new Error(`Groq API Error ${response.status}: ${response.statusText}`);
            }

            if (this.isTest) {
                // In test environment, return the JSON response directly
                const jsonResponse = await response.json();
                return jsonResponse;
            }

            // In non-test environment, handle streaming response
            logger.info('Groq API request successful, streaming response...');
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
            logger.error('Groq API request failed:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
}

module.exports = GroqProvider; 