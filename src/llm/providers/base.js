const logger = require('../../utils/logger');

class BaseLLMProvider {
    constructor(apiKey, endpoint) {
        if (!apiKey) {
            logger.error('[BaseLLMProvider] No API key provided');
            throw new Error('API key is required');
        }
        this.apiKey = apiKey;
        this.endpoint = endpoint;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
        };
    }

    async streamResponse(response, options = {}) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let totalBytes = 0;
        let fullResponse = '';
        let lastLogTime = Date.now();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            totalBytes += value.length;

            // Process each line immediately
            chunk.split('\n').forEach(line => {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const message = JSON.parse(line.replace("data: ", ''));
                        const content = message.choices[0].delta?.content;
                        if (content) {
                            if (options.streamToConsole !== false) {
                                process.stdout.write(content);
                            }
                            fullResponse += content;
                        }
                    } catch (e) {
                        logger.warn(`[${this.constructor.name}] Parse error:`, e.message);
                    }
                }
            });

            // Log progress every 2 seconds
            if (Date.now() - lastLogTime >= 2000) {
                logger.debug(`[Progress] Received ${totalBytes} bytes`);
                lastLogTime = Date.now();
            }
        }

        return fullResponse;
    }

    logRequestDetails(messages, tools = [], requestBody = {}) {
        logger.info(`[${this.constructor.name}] Request headers:`, {
            ...this.getHeaders(),
            'Authorization': 'Bearer *****' + this.apiKey.slice(-4)
        });

        logger.info(`[${this.constructor.name}] Request details:`, {
            messageCount: messages.length,
            toolCount: tools.length,
            firstMessagePreview: messages[0]?.content?.slice(0, 100) + '...',
            messageTypes: messages.map(m => m.role).join(', '),
            totalContentLength: messages.reduce((acc, m) => acc + (m.content?.length || 0), 0),
            model: requestBody.model
        });
    }
}

module.exports = BaseLLMProvider; 