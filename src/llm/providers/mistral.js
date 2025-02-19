const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');

class MistralProvider extends BaseLLMProvider {
    constructor(apiKey, endpoint) {
        super(apiKey, endpoint);
        this.endpoint = endpoint || process.env.MISTRAL_CHAT_ENDPOINT || 'https://codestral.mistral.ai/v1/chat/completions';
    }

    async makeRequest(messages, tools = []) {
        logger.info('[MistralProvider] Making request to:', this.endpoint);
        
        const requestBody = {
            model: process.env.MISTRAL_MODEL || 'codestral-latest',
            messages,
            tool_choice: tools.length ? 'any' : 'none',
            tools: tools.length ? tools : undefined,
            stream: true,
            temperature: 1.0,
        };

        try {
            this.logRequestDetails(messages, tools, requestBody);

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                logger.error('[MistralProvider] API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorData
                });
                throw new Error(`Mistral API Error ${response.status}: ${response.statusText}`);
            }

            logger.info('[MistralProvider] Request successful, streaming response...');
            const fullResponse = await this.streamResponseWithRepetitionCheck(response);
            logger.info('[MistralProvider] Full response received');
            return {choices: [{message: {content: fullResponse}}]};

        } catch (error) {
            logger.error('[MistralProvider] Request failed:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async streamResponseWithRepetitionCheck(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullResponse = '';
        let buffer = '';
        const MAX_REPETITIONS = 4;
        const lineBuffer = [];
        const ERROR_PATTERN = /ReferenceError: document is not defined/g;
        let repetitionCount = 0;
        let lastError = '';

        // Configuration for full response repetition check
        const MIN_MATCH_LENGTH = 50; // Initial length to check for repetition
        const REPETITION_THRESHOLD = 0.8; // 80% of new content must match

        console.debug('[RepetitionDetector] Full response config:', {
            minMatchLength: MIN_MATCH_LENGTH,
            repetitionThreshold: REPETITION_THRESHOLD
        });

        logger.debug('[MistralProvider] Starting stream with error pattern detection');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary;
            while ((boundary = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, boundary).trim();
                buffer = buffer.slice(boundary + 1);

                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    const jsonStr = line.replace("data: ", '');
                    try {
                        const fixed = this.handleStreamingJSON(jsonStr);
                        const message = JSON.parse(fixed.fixedJSON);

                        if (message.choices?.[0]?.delta?.content) {
                            const content = message.choices[0].delta.content;
                            fullResponse += content;
                            process.stdout.write(content);

                            // Full response repetition check
                            if (fullResponse.length > MIN_MATCH_LENGTH && content.length > MIN_MATCH_LENGTH) {
                                let matchLength = MIN_MATCH_LENGTH;
                                while (
                                    matchLength <= content.length &&
                                    matchLength <= fullResponse.length &&
                                    fullResponse.slice(-matchLength) === content.slice(0, matchLength)
                                ) {
                                    matchLength++;
                                }
                                matchLength--; // Adjust back to the actual matched length

                                // If a significant portion of 'content' matches the end of 'fullResponse', it's a repetition
                                if (matchLength >= content.length * REPETITION_THRESHOLD) {
                                    console.debug('[RepetitionDetector] Full response repetition detected:', {
                                        matchLength,
                                        contentLength: content.length,
                                        fullResponseLength: fullResponse.length,
                                        sample: content.slice(0, 100) + '...'
                                    });
                                    logger.info(`Stopping stream - full response repetition detected. Matched ${matchLength} chars.`);
                                    reader.cancel();
                                    return fullResponse;
                                }
                            }

                            // Error pattern detection
                            const errorMatch = content.match(ERROR_PATTERN);
                            if (errorMatch) {
                                const currentError = errorMatch[0];
                                console.debug('Error pattern detected:', currentError.slice(0, 50));
                                
                                if (currentError === lastError) {
                                    repetitionCount++;
                                    logger.debug(`Repetition count increased to: ${repetitionCount}`);
                                } else {
                                    repetitionCount = 1; // Reset counter for new errors
                                    lastError = currentError;
                                }

                                if (repetitionCount >= MAX_REPETITIONS) {
                                    logger.info(`Stopping stream - error pattern repeated ${MAX_REPETITIONS} times`);
                                    console.debug('Repeating error:', lastError);
                                    reader.cancel();
                                    return fullResponse;
                                }
                            } else {
                                // Reset counter if no error in this chunk
                                repetitionCount = 0;
                                lastError = '';
                            }

                            // Trim buffer to retention window
                            if (lineBuffer.length > MIN_MATCH_LENGTH * 2) {
                                lineBuffer.splice(0, lineBuffer.length - MIN_MATCH_LENGTH);
                            }
                        }
                    } catch (e) {
                        logger.warn('Parse error:', e.message);
                    }
                }
            }
        }
        return fullResponse;
    }

    handleStreamingJSON(input) {
        const original = input;
        const steps = [];
         
        try {
            // Handle empty/undefined cases first
            if (!input || input === 'undefined') {
                return { success: true, fixedJSON: '{}', steps: ['Handled empty input'] };
            }

            // Special handling for content fields with JSON-like structures
            input = input.replace(/"content"\s*:\s*([^{\s"][^,]*?)(?=\s*[},])/g, (match, p1) => {
                const cleaned = p1
                    .replace(/([{,]\s*)(\w+)(?=\s*:)/g, '$1"$2"')  // Quote properties
                    .replace(/'/g, '"');  // Replace single quotes
                steps.push(`Processed content value: ${p1}`);
                return `"content": ${cleaned}`;
            });

            // Safer property quoting with boundary checks
            input = input.replace(/([{,]\s*)(\w+)(?=\s*:)/g, (match, prefix, prop) => {
                if (!prop.startsWith('"')) {
                    steps.push(`Added quotes to property: ${prop}`);
                    return `${prefix}"${prop}"`;
                }
                return match;
            });

            // Validate and complete JSON structure
            let openBraces = (input.match(/{/g) || []).length;
            let closeBraces = (input.match(/}/g) || []).length;
            
            // Special case: If we're in the middle of a content object
            if (input.includes('"content": {') && openBraces > closeBraces) {
                input += '}'.repeat(openBraces - closeBraces);
                steps.push(`Added ${openBraces - closeBraces} closing braces for content object`);
            }

            // Final validation with better error reporting
            try {
                JSON.parse(input);
            } catch (e) {
                console.debug('Final JSON validation failed for:', input);
                throw e;
            }

            return { success: true, fixedJSON: input, steps };
        } catch (e) {
            console.error('JSON repair failed for chunk:', original);
            console.debug('Repair steps:', steps);
            return { success: false, error: e.message, steps };
        }
    }
}

module.exports = MistralProvider; 