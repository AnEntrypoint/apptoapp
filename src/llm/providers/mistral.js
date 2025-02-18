const logger = require('../../utils/logger');
const BaseLLMProvider = require('./base');
const levenshtein = require('fast-levenshtein');

function fixBrokenJSON(input) {
    let original = input;
    let steps = [];
  
    try {
        // Handle empty/undefined cases first
        if (input === 'undefined' || input.trim() === '') {
            return { success: true, fixedJSON: '{}', steps: ['Handled empty input'] };
        }
  
        // Check if input is empty or whitespace only
        if (!input || !input.trim()) {
            throw new Error("Input is empty or contains only whitespace");
        }
  
        // Remove comments (none in this input) and whitespace
        input = input.trim();
  
        // Handle escaped quotes and nested quotes in CLI commands
        input = input.replace(/\\\"/g, '\\"');
  
        // Safer property quoting - only add quotes if missing
        input = input.replace(/([{,]\s*)(\w+)(?=\s*:)/g, (match, prefix, prop) => {
            if (!prop.startsWith('"')) {
                steps.push(`Added quotes to property: ${prop}`);
                return `${prefix}"${prop}"`;
            }
            return match;
        });
  
        // Improved value handling
        input = input.replace(/:(\s*)([^{\s"][^,]*?)(\s*)([,}])/g, (match, space1, value, space2, end) => {
            // Detect unquoted string values
            if (!['true','false','null','undefined'].includes(value.toLowerCase()) && 
                isNaN(value) && 
                !value.startsWith('"')) {
                steps.push(`Added quotes to value: ${value}`);
                return `:${space1}"${value}"${space2}${end}`;
            }
            return match;
        });
  
        // Better boolean handling with boundary checks
        input = input.replace(/(:\s*)(True|False)(\s*[,\]}])/gi, (match, prefix, value, suffix) => {
            steps.push(`Normalized boolean: ${value}`);
            return `${prefix}${value.toLowerCase()}${suffix}`;
        });
  
        // Fix invalid null values
        input = input.replace(/:\s*NULL\b/gi, ': null');
  
        // Handle undefined values before JSON parsing
        input = input.replace(/\bundefined\b/g, 'null');
  
        // Remove control characters
        input = input.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
        // Fix missing closing braces and brackets
        let openBraces = (input.match(/\{/g) || []).length;
        let closeBraces = (input.match(/\}/g) || []).length;
        let openBrackets = (input.match(/\[/g) || []).length;
        let closeBrackets = (input.match(/\]/g) || []).length;
  
        input += '}'.repeat(Math.max(0, openBraces - closeBraces));
        input += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  
        // Add debug logging for transformation steps
        if (steps.length > 0) {
            console.debug('JSON repair steps:', steps);
        }
  
        // Attempt to parse and stringify to catch any remaining issues
        let parsed = JSON.parse(input);
        let fixed = JSON.stringify(parsed, null, 2);
  
        return {
            success: true,
            fixedJSON: fixed,
            steps: steps
        };
    } catch (e) {
        console.error('JSON repair failed for input:', original);
        console.debug('Repair steps attempted:', steps);
        return {
            success: false,
            error: `JSON repair failed: ${e.message}`,
            steps: steps,
            partiallyFixedJSON: input
        };
    }
}
    

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
        const MAX_SEQUENCE_LINES = 15;
        const lineBuffer = [];
        const ERROR_PATTERN = /ReferenceError: document is not defined/g;
        let repetitionCount = 0;
        let lastError = '';

        // Configure repetition detection parameters
        const REPETITION_CHECK_WINDOW = 8; // Check last 8 lines for duplicates
        const MIN_REPETITION_LENGTH = 3; // Minimum sequence length to consider
        const MAX_SIMILARITY_RATIO = 0.9; // 90% similarity threshold
        
        console.debug('[RepetitionDetector] Initialized with:', {
            REPETITION_CHECK_WINDOW,
            MIN_REPETITION_LENGTH,
            MAX_SIMILARITY_RATIO
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

                            // Update line buffer with new content
                            const newLines = content.split('\n');
                            lineBuffer.push(...newLines.filter(l => l.trim()));
                            
                            // Enhanced repetition detection
                            if (lineBuffer.length >= REPETITION_CHECK_WINDOW) {
                                const recentLines = lineBuffer.slice(-REPETITION_CHECK_WINDOW);
                                
                                // Compare chunks using similarity ratio
                                const similarityCheck = (a, b) => {
                                    const maxLength = Math.max(a.length, b.length);
                                    const distance = levenshtein.get(a, b);
                                    return (maxLength - distance) / maxLength;
                                };

                                // Check for repeating patterns of increasing lengths
                                let repetitionDetected = false;
                                for (let seqLength = MIN_REPETITION_LENGTH; seqLength <= REPETITION_CHECK_WINDOW/2; seqLength++) {
                                    const sequences = [];
                                    for (let i = 0; i < REPETITION_CHECK_WINDOW - seqLength; i++) {
                                        sequences.push(recentLines.slice(i, i + seqLength).join('\n'));
                                    }

                                    // Find duplicate sequences using similarity threshold
                                    const seen = new Set();
                                    for (const [index, seq] of sequences.entries()) {
                                        // Compare with all previous sequences in this batch
                                        for (const prevSeq of Array.from(seen)) {
                                            const similarity = similarityCheck(prevSeq, seq);
                                            if (similarity >= MAX_SIMILARITY_RATIO) {
                                                console.debug('[RepetitionDetector] Found repeating sequence:', {
                                                    similarity: Math.round(similarity * 100),
                                                    sequence: seq.slice(0, 100)
                                                });
                                                repetitionDetected = true;
                                                break;
                                            }
                                        }
                                        if (repetitionDetected) break;
                                        seen.add(seq);
                                    }
                                    if (repetitionDetected) {
                                        logger.info(`Stopping stream - ${seqLength}-line sequence repeated`);
                                        reader.cancel();
                                        return fullResponse;
                                    }
                                }
                            }

                            // Trim buffer to retention window (fixed size)
                            if (lineBuffer.length > REPETITION_CHECK_WINDOW * 2) {
                                lineBuffer.splice(0, lineBuffer.length - REPETITION_CHECK_WINDOW);
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