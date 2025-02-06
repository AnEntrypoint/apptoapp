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


  return responseData;
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
        fileList.push(`${file.name} (${size})`);
      }
    }
    return fileList;
  } catch (error) {
    console.log('Error listing files: %O', error);
    throw error;
  }
}

async function runBuild() {
  console.log('Starting build process');
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    const child = exec('npm run build', {
      timeout: 120000,
      cwd: process.cwd()
    });

    let stdout = [];
    let stderr = [];
    
    child.stdout.on('data', (data) => {
      console.log('Build output:', data.toString().trim());
      stdout.push(data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      console.log('Build error:', data.toString().trim());
      stderr.push(data.toString().trim());
    });

    child.on('close', (code) => {
      resolve(`Build exit code: ${code}\nSTDOUT:\n${stdout.join('\n')}\nSTDERR:\n${stderr.join('\n')}`);
    });
  });
}

async function runConcurrently() {
  console.log('Starting concurrent processes');
  const { exec } = require('child_process');
  const out = { stdout: [], stderr: [] };
  return new Promise((resolve, reject) => {
    const command = 'concurrently --kill-others "npm run dev" "npx pupdebug"';
    console.log('Executing:', command);

    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Concurrent process error:', error);
        // Return both stdout and stderr for evaluation
        return resolve(`
          stdout:
          ${out.stdout.join('\n')}

          stderr:
          ${out.stderr.join('\n')}

          error:
          ${error.message}
        `);
      }
      console.log('Concurrent processes completed');
      return resolve(`
        stdout: 
        ${out.stdout.join('\n')}

        stderr:
        ${out.stderr.join('\n')}
      `);
    });

    child.stdout.on('data', (data) => {
      console.log('Concurrent output:', data.toString().trim());
      out.stdout.push(data.toString().trim());
    });


    child.stderr.on('data', (data) => {
      console.log('Concurrent error:', data.toString().trim());
      out.stderr.push(data.toString().trim());
    });

  });
}

async function createErrorNote(errorDetails) {
  const messages = [
    {
      role: 'system',
      content: `Create a concise error note that includes:
                1. Error description
                2. Relevant context
                3. Potential solutions
                Keep it brief and actionable.`
    },
    {
      role: 'user',
      content: JSON.stringify(errorDetails)
    }
  ];

  try {
    const response = await makeCodestralRequest(messages, []);
    return `Error Note:\n${response.choices[0].message.content}\n`;
  } catch (error) {
    console.error('Error creating error note:', error);
    return `Error Note:\n${errorDetails.error}\nContext: ${JSON.stringify(errorDetails)}\n`;
  }
}

async function main(instruction, previousNotes = [], previousLogs = '') {
  console.log('Starting main application');

  // Initialize notes with previous notes
  const notes = [...previousNotes];

  // Add error handler to collect notes
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    const noteContent = await createErrorNote({
      error: error.message,
      stack: error.stack
    });
    notes.push(noteContent);
    process.exit(1);
  });

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

  // Add this after directory analysis (line 252)
  console.log('\nRunning initial build');
  const buildLogs = await runBuild();
  console.log('Build logs size:', Buffer.byteLength(buildLogs, 'utf8'), 'bytes');

  // Generate diff and log its size
  console.log('Generating project diff');
  let diff = await createDiff();
  const diffSize = Buffer.byteLength(diff, 'utf8');
  console.log(`Generated diff size: ${diffSize} bytes`);
  const brainstorm = await makeCodestralRequest([
    {
      role: 'system',
      content: "Brainstorm the following code transformations, make a complete list of instructions for each file that needs modification: " + instruction
    },
    {
      role: 'user',  // Second user message containing the diff
      content: `${diff}`
    }], []);
  
  // Modify the messages array (lines 271-281) to include build logs
  const messages = [
    {
      role: 'system',
      content: `Perform these code transformations: ${instruction}\n\n
        If there are any errors, fix them first:\n${buildLogs}\n\n
        Follow these rules:
        1. Fix build errors first
        2. Modify files showing build errors
        Only respond with tool calls, one for each file that needs modification and one for any required CLI commands.`
    },
    {
      role: 'user',
      content: `Project State:\n${diff}\n\nBuild Output:\n${buildLogs}`
    }
  ];


  console.log('Sending to Codestral API');
  try {
    const response = await makeCodestralRequest(messages, tools);
    console.log('API response received');

    // Execute tool calls if present in the API response
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        try {
          await executeToolCall(toolCall);
        } catch (error) {
          const noteContent = await createErrorNote({
            tool: toolCall.function.name,
            error: error.message
          });
          notes.push(noteContent);
        }
      }
    } else if (response.choices[0].message.content) {
      try {
        const toolCalls = JSON.parse(response.choices[0].message.content);
        for (const toolCall of toolCalls) {
          try {
            await executeToolCall(toolCall);
          } catch (error) {
            const noteContent = await createErrorNote({
              tool: toolCall.function.name,
              error: error.message
            });
            notes.push(noteContent);
          }
        }
      } catch (e) {
        console.error('Failed to parse tool calls from content:', e);
      }
    }

    console.log('Transformation complete!');
  } catch (error) {
    console.error('Error during transformation:', error);
    const noteContent = await createErrorNote({
      error: error.message,
      stack: error.stack
    });
    notes.push(noteContent);
    process.exit(1);
  }
  const latestlogs = await runConcurrently();
  // Final evaluation
  const finalMessages = [
    {
      role: 'system',
      content: `Respond with JSON: { "needsRepeat": boolean, "errors": string[] }`
    },
    {
      role: 'user',
      content: `Current Notes:\n${notes.join('\n')}\n\nLatest Logs:\n${latestlogs}`
    }
  ];




  const finalResponse = await makeCodestralRequest(finalMessages, []);
  try {
    const decision = JSON.parse(finalResponse.choices[0].message.content);
    console.log('Final evaluation decision:', decision);
    
    if (decision.needsRepeat) {
      console.log('Errors detected, restarting process');
      await main(instruction, notes, latestlogs);
    } else {
      console.log('No errors found, process complete');
    }
  } catch (e) {
    console.error('Failed to parse final decision:', e);
    // Default to retry if parsing fails
    await main(instruction, notes, latestlogs);
  }
}

// Get instruction from command line arguments
const instruction = process.argv[2];
main(instruction).catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});

// Export the runProgram function
module.exports = { main };