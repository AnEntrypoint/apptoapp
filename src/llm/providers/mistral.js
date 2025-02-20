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
            top_p: 1.0,
            presence_penalty: 0.02,
            temperature: 0.1,
        };

        try {
            this.logRequestDetails(messages, tools, requestBody);
            console.log('Request endpoint:', this.endpoint);
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
        let lastChunkTime = Date.now(); // Track the time of the last chunk received
        const TIMEOUT_DURATION = 10000; // 10 seconds timeout

        // Configuration for sequence repetition detection
        const MIN_SEQUENCE_LENGTH = 100;
        const SEQUENCE_REPETITION_THRESHOLD = 5;
        const SLIDING_WINDOW_SIZE = 5000;

        logger.debug('[RepetitionDetector] Starting with config:', {
            minSequenceLength: MIN_SEQUENCE_LENGTH,
            repetitionThreshold: SEQUENCE_REPETITION_THRESHOLD,
            windowSize: SLIDING_WINDOW_SIZE
        });

        // Helper function to detect sequence repetition
        const detectRepetition = (text) => {
            if (text.length < MIN_SEQUENCE_LENGTH * 2) return false;

            // Get the last window of text to check
            const windowText = text.slice(-SLIDING_WINDOW_SIZE);
            
            // Check sequences of increasing length
            for (let len = MIN_SEQUENCE_LENGTH; len <= windowText.length / 3; len++) {
                const sequence = windowText.slice(-len);
                let count = 0;
                let pos = -1;
                
                // Count non-overlapping occurrences
                while ((pos = windowText.indexOf(sequence, pos + 1)) !== -1) {
                    count++;
                    if (count >= SEQUENCE_REPETITION_THRESHOLD) {
                        logger.debug(`[RepetitionDetector] Found repetition:`, {
                            length: len,
                            count,
                            sample: sequence
                        });
                        const uniqueSequences = new Set();
                        const filteredResponse = fullResponse.split('\n').filter(line => {
                            if (uniqueSequences.has(line)) {
                                return false; // Skip duplicate
                            }
                            uniqueSequences.add(line);
                            return true; // Keep unique
                        }).join('\n');
                        fullResponse = filteredResponse;
                        return true;
                    }
                }
            }
            return false;
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            lastChunkTime = Date.now(); // Reset the timeout timer

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
                            
                            // Check for repetition in the full response
                            if (detectRepetition(fullResponse)) {
                                logger.info('Stopping stream - repetition detected');
                                reader.cancel();
                                return fullResponse;
                            }

                            process.stdout.write(content);
                        }
                    } catch (e) {
                        logger.warn('Parse error:', e.message);
                    }
                }
            }

            // Check for timeout
            if (Date.now() - lastChunkTime > TIMEOUT_DURATION) {
                logger.warn('[MistralProvider] No chunks received for 10 seconds, giving up.');
                reader.cancel();
                break;
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