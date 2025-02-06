const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { makeCodestralRequest } = require('./index.js');

const execAsync = promisify(exec);

const tools = [
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file"
          },
          content: {
            type: "string",
            description: "Content to write to the file"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deleteFile",
      description: "Delete a file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to delete"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "createFolder",
      description: "Create a new folder",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the folder to create"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deleteFolder",
      description: "Delete a folder",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the folder to delete"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "executeCommand",
      description: "Execute a CLI command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Command to execute"
          }
        },
        required: ["command"]
      }
    }
  }
];

async function executeToolCall(toolCall) {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);
  console.log('Executing tool: %s', name);
  console.log('Arguments: %O', parsedArgs);

  try {
    switch (name) {
      case "writeFile":
        console.log('Writing file: %s', parsedArgs.path);
        await fs.writeFile(parsedArgs.path, parsedArgs.content, 'utf8');
        return `File written: ${parsedArgs.path}`;

      case "deleteFile":
        console.log('Deleting file: %s', parsedArgs.path);
        await fs.unlink(parsedArgs.path);
        return `File deleted: ${parsedArgs.path}`;

      case "createFolder":
        console.log('Creating folder: %s', parsedArgs.path);
        await fs.mkdir(parsedArgs.path, { recursive: true });
        return `Folder created: ${parsedArgs.path}`;

      case "deleteFolder":
        console.log('Deleting folder: %s', parsedArgs.path);
        await fs.rm(parsedArgs.path, { recursive: true, force: true });
        return `Folder deleted: ${parsedArgs.path}`;

      case "executeCommand":
        console.log('Executing command: %s', parsedArgs.command);
        // Add --legacy-peer-deps to npm install commands
        const command = parsedArgs.command.includes('npm install') 
          ? 'npm install --legacy-peer-deps'
          : parsedArgs.command;
        
        const { stdout, stderr } = await execAsync(command);
        console.log('Command output: %s', stdout + stderr);
        
        // If command fails, create a note
        if (stderr) {
          const noteContent = await createErrorNote({
            command: parsedArgs.command,
            error: stderr
          });
          await fs.appendFile('NOTES.txt', `\n${noteContent}\n`, 'utf8');
        }
        
        return `Command executed: ${parsedArgs.command}\nOutput: ${stdout}${stderr}`;

      default:
        console.log('Unknown tool called: %s', name);
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.log('Tool execution error: %O', error);
    
    // Create a note for the error
    const noteContent = await createErrorNote({
      tool: name,
      error: error.message
    });
    await fs.appendFile('NOTES.txt', `\n${noteContent}\n`, 'utf8');
    
    throw error;
  }
}

async function createErrorNote(errorDetails) {
  const messages = [
    {
      role: 'system',
      content: 'Create a concise note about this error that would be helpful for debugging. Include the error details and any potential solutions.'
    },
    {
      role: 'user',
      content: JSON.stringify(errorDetails)
    }
  ];

  const response = await makeCodestralRequest(messages, []);
  return response.choices[0].message.content;
}

module.exports = { tools, executeToolCall };