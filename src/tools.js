const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      timeout: 5000,
      ...options
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim() + '\n');  // Trim and add single newline
    });
  });
}

async function writeFile(filePath, content) {
  try {
    // Ensure the directory exists
    const dir = path.dirname(filePath);

    // Check if the directory exists
    try {
      await fs.access(dir);
    } catch (accessError) {
      throw new Error(`Directory does not exist: ${dir}`);
    }

    // Check if the directory is writable
    try {
      await fs.access(dir, fs.constants.W_OK);
    } catch (accessError) {
      throw new Error(`Cannot write to directory: ${dir}`);
    }

    // Write the file
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    // Explicitly handle different error cases
    if (error.code === 'ENOENT') {
      throw new Error(`Cannot write to path: ${filePath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`);
    }
    throw error;
  }
}

function getTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'executeCommand',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute'
            }
          },
          required: ['command']
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
              description: 'Path to the file to write'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['filePath', 'content']
        }
      }
    }
  ];
}

async function executeToolCall(toolCall) {
  const toolName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);
  const argsString = JSON.stringify(args);
  const truncatedArgs = argsString.length > 100 ? `${argsString.substring(0, 97)}...` : argsString;
  console.log('Calling tool:', toolName, truncatedArgs);
  switch (toolName) {
    case 'executeCommand':
      return await executeCommand(args.command);
    case 'writeFile':
      return await writeFile(args.filePath, args.content);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  executeCommand,
  writeFile,
  getTools,
  executeToolCall
};