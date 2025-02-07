const fs = require('fs').promises;
const path = require('path');
const { createErrorNote } = require('./utils');
const doctrine = require('doctrine');

const toolImplementations = {};

// This function builds each tool's metadata as a plain object with parameters defined in a JSON schema.
async function loadTools() {
    const toolsDir = path.join(__dirname, 'tools');
    const tools = [];
    
    try {
        const files = await fs.readdir(toolsDir);
        
        for (const file of files) {
            if (file.endsWith('.js')) {
                const filePath = path.join(toolsDir, file);
                const content = await fs.readFile(filePath, 'utf8');
                
                // Parse JSDoc comments
                const jsdoc = content.match(/\/\*\*\s*\n([^*]|\*[^/])*\*\//g)?.[0];
                if (!jsdoc) continue;
                
                const parsed = doctrine.parse(jsdoc, { unwrap: true });
                const toolMeta = {
                    name: '',
                    description: '',
                    parameters: {}
                };
                
                // Extract metadata from JSDoc tags
                parsed.tags.forEach(tag => {
                    switch (tag.title) {
                        case 'tool':
                            toolMeta.name = tag.description;
                            break;
                        case 'description':
                            toolMeta.description = tag.description;
                            break;
                        case 'param':
                            // Convert the type to lowercase to conform with JSON Schema standards
                            toolMeta.parameters[tag.name] = {
                                type: tag.type.name.toLowerCase(),
                                description: tag.description
                            };
                            break;
                    }
                });
                
                // Wrap the metadata in the "function" key as required by the API.
                const apiToolMeta = {
                    name: toolMeta.name,
                    description: toolMeta.description,
                    parameters: {
                        type: 'object',
                        properties: toolMeta.parameters,
                        required: Object.keys(toolMeta.parameters),
                        additionalProperties: false
                    }
                };
                
                tools.push({
                    type: 'function',
                    function: apiToolMeta
                });
                
                // Dynamically load the tool implementation
                const implementation = require(filePath);
                toolImplementations[toolMeta.name] = implementation;
            }
        }
    } catch (error) {
        console.error('Error loading tools:', error);
        throw error;
    }
    
    return tools;
}

async function executeToolCall(toolCall) {
    console.log('Tool call received:', toolCall);
    
    // Get the function details from the tool call.
    const toolFunc = toolCall.function;
    if (!toolFunc || !toolFunc.name) {
        throw new Error('Invalid tool call: missing function definition.');
    }
    const name = toolFunc.name;
    
    // Use arguments from toolCall or from toolFunc.
    let args = toolCall.arguments || toolFunc.arguments;
    
    // If arguments are provided as a JSON string, parse them.
    if (typeof args === 'string') {
        try {
            args = JSON.parse(args);
        } catch (err) {
            console.error('Error parsing tool arguments:', err);
            throw new Error('Invalid JSON for tool arguments.');
        }
    }
    
    try {
        console.log('Executing tool:', name);
        console.log('Arguments:', args);
        // If arguments are provided as an object, convert them into an ordered array.
        let orderedArgs = [];
        if (args && typeof args === 'object' && !Array.isArray(args)) {
            // Using the natural key order; adjust if a specific order is required.
            const paramOrder = Object.keys(args);
            orderedArgs = paramOrder.map(key => args[key]);
        } else if (Array.isArray(args)) {
            orderedArgs = args;
        }
        
        const result = await toolImplementations[name](...orderedArgs);
        return result;
    } catch (error) {
        console.log('Tool execution error:', error);
        const noteContent = await createErrorNote({
            tool: name,
            error: error.message
        });
        console.log('Error note created:', noteContent);
        throw error;
    }
}

// Initialize tools on module load
let tools = [];
(async () => {
    tools = await loadTools();
    tools.forEach(tool => {
        console.log('Loaded tool:', tool.function.name);
    }); 
})();

function getTools() {
    return tools;
} 

module.exports = { getTools, executeToolCall };