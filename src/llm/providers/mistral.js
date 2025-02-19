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

        // Enhanced configuration for repetition detection
        const MIN_MATCH_LENGTH = 50;
        const REPETITION_THRESHOLD = 0.8;
        const IMPORT_REPETITION_THRESHOLD = 3;
        const PATTERN_REPETITION_THRESHOLD = 3;
        const COMMAND_REPETITION_THRESHOLD = 3;
        const MIN_PATTERN_LENGTH = 100;
        const SLIDING_WINDOW_SIZE = 2000;
        const FILE_CONTENT_WINDOW_SIZE = 5000;
        const importTracker = new Map();
        const patternTracker = new Map();
        const fileContentTracker = new Map();
        const commandTracker = new Map();
        const npmCommandTracker = new Map();

        // Track the last N chunks for pattern detection
        const recentChunks = [];
        const MAX_RECENT_CHUNKS = 10;

        console.debug('[RepetitionDetector] Configuration:', {
            minMatchLength: MIN_MATCH_LENGTH,
            repetitionThreshold: REPETITION_THRESHOLD,
            importRepetitionThreshold: IMPORT_REPETITION_THRESHOLD,
            patternRepetitionThreshold: PATTERN_REPETITION_THRESHOLD,
            commandRepetitionThreshold: COMMAND_REPETITION_THRESHOLD,
            minPatternLength: MIN_PATTERN_LENGTH,
            slidingWindowSize: SLIDING_WINDOW_SIZE,
            fileContentWindowSize: FILE_CONTENT_WINDOW_SIZE
        });

        // Helper function to detect command repetition
        const detectCommandRepetition = (content) => {
            // Check for shell commands in code blocks
            const codeBlocks = content.match(/```(?:bash|sh)?\s*([^`]+)```/g) || [];
            for (const block of codeBlocks) {
                const commands = block.match(/(?:npm|yarn|pnpm)\s+(?:install|add|remove|i)\s+[^;\n]+/g) || [];
                for (const cmd of commands) {
                    const count = npmCommandTracker.get(cmd) || 0;
                    npmCommandTracker.set(cmd, count + 1);
                    
                    if (count + 1 >= COMMAND_REPETITION_THRESHOLD) {
                        logger.debug(`[RepetitionDetector] NPM command repeated ${count + 1} times: ${cmd}`);
                        return true;
                    }
                }

                // Track other shell commands
                const shellCommands = block.match(/[^\s;]+(?:\s+(?:--?\w+|\S+))*(?=\s*(?:;|\n|$))/g) || [];
                for (const cmd of shellCommands) {
                    const count = commandTracker.get(cmd) || 0;
                    commandTracker.set(cmd, count + 1);
                    
                    if (count + 1 >= COMMAND_REPETITION_THRESHOLD) {
                        logger.debug(`[RepetitionDetector] Shell command repeated ${count + 1} times: ${cmd}`);
                        return true;
                    }
                }
            }
            return false;
        };

        // Helper function to detect repeating patterns with improved command handling
        const detectRepeatingPattern = (text, minLength = MIN_PATTERN_LENGTH) => {
            if (text.length < minLength * 2) return null;
            
            // Use sliding window to find potential patterns
            for (let len = minLength; len <= text.length / 3; len++) {
                const pattern = text.slice(-len);
                
                // Skip if pattern contains code block markers
                if (pattern.includes('```')) continue;
                
                // Skip if pattern is just whitespace or common formatting
                if (/^\s*$/.test(pattern) || /^[#\s-_*]+$/.test(pattern)) continue;
                
                // Escape special regex characters and create pattern
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedPattern, 'g');
                const matches = text.match(regex) || [];
                
                if (matches.length >= PATTERN_REPETITION_THRESHOLD) {
                    logger.debug(`[RepetitionDetector] Found repeating pattern of length ${len} with ${matches.length} occurrences`);
                    return pattern;
                }
            }
            return null;
        };

        logger.debug('[MistralProvider] Starting stream with enhanced repetition detection');

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
                            
                            // Store recent chunks for pattern detection
                            recentChunks.push(content);
                            if (recentChunks.length > MAX_RECENT_CHUNKS) {
                                recentChunks.shift();
                            }

                            // Check for command repetition
                            if (detectCommandRepetition(content)) {
                                logger.info('Stopping stream - command repetition detected');
                                reader.cancel();
                                return fullResponse;
                            }

                            // Check for repeating patterns in recent chunks
                            const combinedRecentContent = recentChunks.join('');
                            const pattern = detectRepeatingPattern(combinedRecentContent);
                            if (pattern) {
                                const count = patternTracker.get(pattern) || 0;
                                patternTracker.set(pattern, count + 1);
                                
                                if (count + 1 >= PATTERN_REPETITION_THRESHOLD) {
                                    logger.info(`Stopping stream - pattern repeated ${count + 1} times`);
                                    reader.cancel();
                                    return fullResponse;
                                }
                            }

                            fullResponse += content;
                            process.stdout.write(content);

                            // Enhanced sliding window repetition check
                            const windowContent = fullResponse.slice(-FILE_CONTENT_WINDOW_SIZE);
                            if (windowContent.length >= MIN_MATCH_LENGTH && content.length >= MIN_MATCH_LENGTH) {
                                let matchLength = MIN_MATCH_LENGTH;
                                while (
                                    matchLength <= content.length &&
                                    matchLength <= windowContent.length &&
                                    windowContent.slice(-matchLength) === content.slice(0, matchLength)
                                ) {
                                    matchLength++;
                                }
                                matchLength--;

                                if (matchLength >= content.length * REPETITION_THRESHOLD) {
                                    logger.info(`Stopping stream - sliding window repetition detected (${matchLength} chars)`);
                                    reader.cancel();
                                    return fullResponse;
                                }
                            }

                            // Error pattern detection (existing code)
                            const errorMatch = content.match(ERROR_PATTERN);
                            if (errorMatch) {
                                const currentError = errorMatch[0];
                                if (currentError === lastError) {
                                    repetitionCount++;
                                } else {
                                    repetitionCount = 1;
                                    lastError = currentError;
                                }

                                if (repetitionCount >= MAX_REPETITIONS) {
                                    logger.info(`Stopping stream - error pattern repeated ${MAX_REPETITIONS} times`);
                                    reader.cancel();
                                    return fullResponse;
                                }
                            } else {
                                repetitionCount = 0;
                                lastError = '';
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