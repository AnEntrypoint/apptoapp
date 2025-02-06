const { createDiff } = require('./diff.js');
const { tools, executeToolCall } = require('./tools.js');
const dotenv = require('dotenv');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const ignore = require('ignore');

dotenv.config();
console.log('Environment loaded');

const CODESTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const CHAT_ENDPOINT = 'https://codestral.mistral.ai/v1/chat/completions';

async function loadIgnorePatterns() {
  try {
    const ignoreContent = await fsp.readFile('.llmignore', 'utf8');
    const ig = ignore().add(ignoreContent);
    console.log('Ignore patterns loaded successfully');
    return ig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No .llmignore file found, using empty ignore list');
      return ignore();
    }
    throw error;
  }
}

async function makeCodestralRequest(messages, tools) {
  console.log('Making Codestral API request');
  console.log('Messages count: %d', messages.length);
  console.log('Tools count: %d', tools.length);

  const totalTokensSent = messages.reduce((acc, msg) => acc + msg.content.split(' ').length, 0);
  console.log('Total tokens sent: %d', totalTokensSent);

  const response = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CODESTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "codestral-latest",
      messages,
      tools,
      stream: false
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.log('API error: %O', error);
    throw new Error(`Codestral API error: ${error.message || response.statusText}`);
  }

  console.log('API request successful');
  const responseData = await response.json();
  
  // Handle tool call token counting
  let totalTokensReceived = 0;
  if (responseData.choices[0].message.tool_calls) {
    totalTokensReceived = responseData.choices[0].message.tool_calls
      .reduce((acc, toolCall) => acc + JSON.stringify(toolCall).split(' ').length, 0);
  } else if (responseData.choices[0].message.content) {
    totalTokensReceived = responseData.choices[0].message.content.split(' ').length;
  }
  
  console.log('Total tokens received: %d', totalTokensReceived);
  
  return responseData;
}

function setupLogging() {
  const fs = require('fs');
  const logFilePath = 'serverlogs.txt';
  
  // Clear the log file
  fs.writeFileSync(logFilePath, '');
}

async function calculateDirectorySize(dir, ig) {
  console.log('Calculating size for directory: %s', dir);
  try {
    const files = await fsp.readdir(dir, { withFileTypes: true });
    let totalSize = 0;

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) {
        console.log('Ignoring path: %s', relativePath);
        continue;
      }

      if (file.isDirectory()) {
        console.log('Processing subdirectory: %s', file.name);
        // Don't add directory sizes to the total
        await calculateDirectorySize(fullPath, ig);
      } else {
        const stats = await fsp.stat(fullPath);
        console.log('Processing file: %s (%s bytes)', file.name, stats.size);
        totalSize += stats.size;
      }
    }
    console.log('Completed size calculation for %s: %d bytes', dir, totalSize);
    return totalSize;
  } catch (error) {
    console.log('Error calculating directory size: %O', error);
    throw error;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function listFiles(dir, ig) {
  console.log('Listing files in directory: %s', dir);
  try {
    const files = await fsp.readdir(dir, { withFileTypes: true });
    const fileList = [];

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) {
        console.log('Ignoring path: %s', relativePath);
        continue;
      }

      if (file.isDirectory()) {
        console.log('Found directory: %s', file.name);
        const subFiles = await listFiles(fullPath, ig);
        // All directories show as 0KB
        fileList.push(`${file.name}/ (0KB)`);
        fileList.push(...subFiles.map(f => `  ${f}`));
      } else {
        // Check if file is under components/ui
        const isUiComponent = fullPath.includes(path.join('components', 'ui'));
        const size = isUiComponent ? '0KB' : formatBytes((await fsp.stat(fullPath)).size);
        console.log('Found file: %s (%s)', file.name, size);
        fileList.push(`${file.name} (${size})`);
      }
    }
    return fileList;
  } catch (error) {
    console.log('Error listing files: %O', error);
    throw error;
  }
}

async function main(instruction) {
  console.log('Starting main application');
  
  // Validate instruction
  if (!instruction || instruction.trim() === '') {
    console.error('Error: No instruction provided');
    process.exit(1);
  }
  
  console.log('Processing instruction:', instruction);
  
  // Load ignore patterns
  const ig = await loadIgnorePatterns();
  
  // Directory analysis
  console.log('Starting directory analysis');
  const dir = process.cwd();
  console.log('Current working directory: %s', dir);
  
  const totalSize = await calculateDirectorySize(dir, ig);
  const fileList = await listFiles(dir, ig);

  console.log('\nDirectory Analysis:');
  console.log(`Total Size: ${formatBytes(totalSize)}`);
  console.log('Files and Directories:');
  fileList.forEach(f => console.log(`- ${f}`));
  console.log('');

  // Generate diff and log its size
  console.log('Generating project diff');
  const diff = await createDiff();
  const diffSize = Buffer.byteLength(diff, 'utf8');
  console.log(`Generated diff size: ${diffSize} bytes`);

  // Prepare messages for the Codestral API request
  const messages = [
    {
      role: 'system',
      content: "You are a professional web developer. Transform the code according to the user's instructions."
    },
    {
      role: 'user',
      content: instruction
    },
    {
      role: 'user',  // Second user message containing the diff
      content: `CODE DIFF:\n${diff}`
    }
  ];

  console.log('Sending to Codestral API');
  try {
    const response = await makeCodestralRequest(messages, tools);
    console.log('API response received');

    // Execute tool calls if present in the API response
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        await executeToolCall(toolCall);
      }
    }

    console.log('Transformation complete!');
  } catch (error) {
    console.error('Error during transformation:', error);
    process.exit(1);
  }

  console.log('Main application setup complete');
}

// Get instruction from command line arguments
const instruction = process.argv[2];
main(instruction).catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});

// Add a new function to run the program after generation
async function runProgram() {
  console.log('Preparing to run npm run dev');
  const { spawn } = require('child_process');
  
  console.log('Creating log stream');
  const logStream = fs.createWriteStream('serverlogs.txt', { flags: 'a' });

  console.log('Spawning npm run dev process');
  const child = spawn('npm', ['run', 'dev'], { 
    cwd: '',
    shell: true
  });

  child.stdout.on('data', (data) => {
    console.log('npm run dev stdout: %s', data.toString().trim());
    logStream.write(data.toString());
  });

  child.stderr.on('data', (data) => {
    console.log('npm run dev stderr: %s', data.toString().trim());
    logStream.write(data.toString());
  });

  child.on('close', (code) => {
    console.log('npm run dev process exited with code %d', code);
    logStream.end();
    console.log('Application completed');
  });
}

// Export the runProgram function
module.exports = { main, runProgram };