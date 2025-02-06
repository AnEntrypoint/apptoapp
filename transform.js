const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { exec } = require('child_process');

dotenv.config();

const transformationLibrary = {
  debug: process.env.debug || false,

  generateJsonData: async function(transformationInstruction) {
    try {
      const jsonEntries = await this.readSrcDirectory('./');
      const generatedJsonData = this.formatJsonData(jsonEntries);

      const systemPrompt = `You are a code transformation assistant. Analyze the files and perform the requested modifications.
Response format must be a JSON array of operations, each with 'operation' and 'params' fields.
Available operations:
- write: params: {path: string, content: string}
- move: params: {from: string, to: string}
- delete: params: {path: string}
- rename: params: {from: string, to: string}
- writeFolder: params: {path: string}
- deleteFolder: params: {path: string}
- cli: params: {command: string}
Example response:
[
  {"operation": "delete", "params": {"path": "oldfile.js"}},
  {"operation": "write", "params": {"path": "newfile.js", "content": "console.log('hello')"}},
  {"operation": "move", "params": {"from": "src/util.js", "to": "lib/util.js"}},
  {"operation": "writeFolder", "params": {"path": "new_folder"}},
  {"operation": "deleteFolder", "params": {"path": "old_folder"}},
  {"operation": "cli", "params": {"command": "npm run dev"}}
]`;

      const messages = [
        { "role": "system", "content": systemPrompt },
        { "role": "user", "content": `${generatedJsonData}\n\nTransformation request: ${transformationInstruction}` },
      ];

      // Choose API based on configuration
      const usesMistral = process.env.MISTRAL_API_KEY && process.env.MISTRAL_MODEL;
      
      if (!usesMistral && !process.env.OPENAI_API_KEY) {
        throw new Error('Please set either MISTRAL_API_KEY or OPENAI_API_KEY in .env');
      }

      let response;
      if (usesMistral) {
        console.log('Using Mistral API');
        response = await this.callMistralAPI(messages);
      } else {
        console.log('Using OpenAI API');
        response = await this.callOpenAIAPI(messages);
      }

      if (this.debug) fs.writeFileSync('transformed.out', response);
      
      // Parse and execute the operations
      try {
        const operations = JSON.parse(response);
        await this.executeOperations(operations);
      } catch (error) {
        console.error('Error parsing or executing operations:', error);
        console.error('Raw response:', response);
        throw new Error('Failed to process AI response');
      }

      return response;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  },

  executeOperations: async function(operations) {
    if (!Array.isArray(operations)) {
      throw new Error('Operations must be an array');
    }

    console.log(`Executing ${operations.length} operations...`);

    for (const op of operations) {
      try {
        console.log(`Executing operation: ${op.operation}`);
        
        switch (op.operation) {
          case 'write':
            await this.writeFile(op.params.path, op.params.content);
            break;
          
          case 'move':
            await this.moveFile(op.params.from, op.params.to);
            break;
          
          case 'delete':
            await this.deleteFile(op.params.path);
            break;
          
          case 'rename':
            await this.renameFile(op.params.from, op.params.to);
            break;
          
          case 'writeFolder':
            await this.writeFolder(op.params.path);
            break;
          
          case 'deleteFolder':
            await this.deleteFolder(op.params.path);
            break;
          
          case 'cli':
            await this.callCliCommand(op.params.command);
            break;
          
          default:
            console.warn(`Unknown operation: ${op.operation}`);
        }
      } catch (error) {
        console.error(`Failed to execute operation ${op.operation}:`, error);
        throw error;
      }
    }
  },

  callMistralAPI: async function(messages) {
    const response = await fetch(process.env.MISTRAL_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: 16384,
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  },

  callOpenAIAPI: async function(messages) {
    const OpenAI = require("openai");
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 16384,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    });

    if (response.choices[0].finish_reason === 'length') {
      throw new Error("BAILING OUT BECAUSE FINISH REASON IS LENGTH, PLEASE USE A BIGGER MODEL");
    }

    return response.choices[0].message.content.trim();
  },

  readSrcDirectory: async function(srcDirectory) {
    const jsonEntries = {};
    const files = fs.readdirSync(srcDirectory);
    
    await Promise.all(files.map(async filename => {
      const filePath = path.join(srcDirectory, filename);
      if (filePath.startsWith('node_modules') || filePath.startsWith('.')) {
        return; // Skip these files
      }
      if (fs.statSync(filePath).isDirectory()) {
        Object.assign(jsonEntries, await this.readSrcDirectory(filePath));
      } else {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        jsonEntries[filePath] = fileContent;
      }
    }));

    return jsonEntries;
  },

  formatJsonData: function(jsonEntries) {
    return JSON.stringify(jsonEntries, null, 2);
  },

  writeFile: async function(filePath, content) {
    try {
      const directory = path.dirname(filePath);
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`Successfully wrote file: ${filePath}`);
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      throw error;
    }
  },

  moveFile: async function(sourcePath, targetPath) {
    try {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file doesn't exist: ${sourcePath}`);
      }
      
      const targetDir = path.dirname(targetPath);
      await fs.promises.mkdir(targetDir, { recursive: true });
      
      await fs.promises.rename(sourcePath, targetPath);
      console.log(`Successfully moved ${sourcePath} to ${targetPath}`);
    } catch (error) {
      console.error(`Error moving file from ${sourcePath} to ${targetPath}:`, error);
      throw error;
    }
  },

  deleteFile: async function(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`Successfully deleted: ${filePath}`);
        
        // Try to remove empty directories
        let dirPath = path.dirname(filePath);
        while (dirPath !== '.') {
          if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
            await fs.promises.rmdir(dirPath);
            console.log(`Removed empty directory: ${dirPath}`);
            dirPath = path.dirname(dirPath);
          } else {
            break;
          }
        }
      } else {
        console.log(`File doesn't exist, skipping delete: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      throw error;
    }
  },

  renameFile: async function(oldPath, newPath) {
    try {
      if (!fs.existsSync(oldPath)) {
        throw new Error(`Source file doesn't exist: ${oldPath}`);
      }
      
      const newDir = path.dirname(newPath);
      await fs.promises.mkdir(newDir, { recursive: true });
      
      await fs.promises.rename(oldPath, newPath);
      console.log(`Successfully renamed ${oldPath} to ${newPath}`);
    } catch (error) {
      console.error(`Error renaming file from ${oldPath} to ${newPath}:`, error);
      throw error;
    }
  },

  writeFolder: async function(folderPath) {
    try {
      await fs.promises.mkdir(folderPath, { recursive: true });
      console.log(`Successfully created folder: ${folderPath}`);
    } catch (error) {
      console.error(`Error creating folder ${folderPath}:`, error);
      throw error;
    }
  },

  deleteFolder: async function(folderPath) {
    try {
      if (fs.existsSync(folderPath)) {
        await fs.promises.rm(folderPath, { recursive: true, force: true });
        console.log(`Successfully deleted folder: ${folderPath}`);
      } else {
        console.log(`Folder does not exist, skipping deletion: ${folderPath}`);
      }
    } catch (error) {
      console.error(`Error deleting folder ${folderPath}:`, error);
      throw error;
    }
  },

  callCliCommand: async function(command) {
    console.log(`Executing CLI command: ${command}`);
    return new Promise((resolve, reject) => {
      exec(command, { shell: 'powershell.exe' }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${command}`, error);
          return reject(error);
        }
        console.log(`Command output: ${stdout}`);
        if (stderr && stderr.trim() !== "") {
          console.warn(`Command stderr: ${stderr}`);
        }
        resolve(stdout.trim());
      });
    });
  }
};

module.exports = transformationLibrary;
