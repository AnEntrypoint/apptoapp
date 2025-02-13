const { executeCommand } = require('./utils');
const fsp = require('fs').promises; // Added missing fsp definition

function getTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'executeCommand',
        description: 'Execute a CLI command',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Command to execute'
            }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'writeFile',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Path to the file (required)'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['filePath', 'content'],
          additionalProperties: false
        }
      }
    }
  ];
}

async function executeToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args; // JSON parse if it's a string, keep it if it's an object
  if (name === 'executeCommand') {
    return executeCommand(parsedArgs.command);
  } else if (name === 'writeFile') {
    return fsp.writeFile(parsedArgs.filePath, parsedArgs.content, 'utf8');
  } else {
    throw new Error(`Unknown tool call: ${name}`);
  }
}

module.exports = { getTools, executeToolCall };
