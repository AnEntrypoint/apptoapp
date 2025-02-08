#!/usr/bin/env node
const { createDiff } = require('./diff.js');
const { getTools, executeToolCall } = require('./tools.js');
const dotenv = require('dotenv');
const fsp = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, formatBytes, makeApiRequest, createErrorNote } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');

dotenv.config();

async function calculateDirectorySize(dir, ig) {
  try {
    const files = await fsp.readdir(dir, { withFileTypes: true });
    let totalSize = 0;

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) {
        continue;
      }

      if (file.isDirectory()) {
        await calculateDirectorySize(fullPath, ig);
      } else {
        const stats = await fsp.stat(fullPath);
        totalSize += stats.size;
      }
    }
    return totalSize;
  } catch (error) {
    console.log('Error calculating directory size: %O', error);
    throw error;
  }
}

async function listFiles(dir, ig) {
  try {
    const files = await fsp.readdir(dir, { withFileTypes: true });
    const fileList = [];

    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) {
        continue;
      }

      if (file.isDirectory()) {
        const subFiles = await listFiles(fullPath, ig);
        fileList.push(`${file.name}/ (0KB)`);
        fileList.push(...subFiles.map(f => `  ${f}`));
      } else {
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

  let result, code, stdout, stderr;
  result = await executeCommand('npm install --legacy-peer-deps');
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;
  if (code !== 0) {
    throw new Error(`Build failed: ${stderr || stdout}`);
  }

  /*result = await executeCommand('npx eslint . --ignore-pattern .next/'); // Linting the project using ESLint, ignoring .next
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;
  if (code !== 0) {
    console.error('Lint failed with exit code:', code);
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    throw new Error(`Lint failed: ${stderr || stdout}`);
  }*/

  result = await executeCommand('npm run build'); 
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;

  if (code !== 0) {
    console.error('Build failed with exit code:', code);
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    throw new Error(`Build failed: ${stderr || stdout}`);
  }
  return `Build exit code: ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;

}

async function main(instruction, previousLogs = '') {

  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    const noteContent = await createErrorNote({
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  if (!instruction || instruction.trim() === '') {
    console.error('Error: No instruction provided');
    process.exit(1);
  }
  console.log(`\n\n--------------------------------\n\nProcessing instruction:\n\n--------------------------------\n${instruction}\n\n`);
  const ig = await loadIgnorePatterns();

  const dir = process.cwd();

  const totalSize = await calculateDirectorySize(dir, ig);
  const fileList = await listFiles(dir, ig);

  console.log(`Total Size: ${formatBytes(totalSize)}`);
  //console.log('Files and Directories:');
  //fileList.forEach(f => console.log(`- ${f}`));
  //console.log('');


  /*console.log('\nRunning initial build');
  let buildLogs;
  try {
    buildLogs = await runBuild();
    console.log('Build logs:', buildLogs);
    console.log('Build logs size:', Buffer.byteLength(buildLogs, 'utf8'), 'bytes');
  } catch (e) {
    buildLogs = e.message;
  }*/

  let diff = await createDiff('.');
  const diffContent = diff; // Store the diff content
  try {
    await fsp.writeFile(path.join('..', 'diff.txt'), diffContent, 'utf8');
  } catch (error) {
    console.error('Error writing diff to file:', error);
  }

  
  // Here we can define a function to brainstorm the task using an LLM call
  async function brainstormTaskWithLLM(instruction) {
    const messages = [
      {
        role: 'system',
        content: `Plan this instruction: "${instruction}" into a bullet list summary of instructions for code transformations, only include code transformations, dont include any system or devops tasks or other instructions. The current path is the project root. The current directory is ${process.cwd()}.`+
        `${cmdhistory.length > 0 ? 'Here is the logs, also plan the task based on the logs fixing any errors: '+cmdhistory.join('\n') : ''}\n\n`+
        `${previousLogs ? "\n\n and resolve this error: " + previousLogs : ''}\n\n`
      },
      {
        role: 'user',
        content: diff
      }
    ];
    
    try {
      const response = await makeApiRequest(
        messages,
        [],
        process.env.MISTRAL_API_KEY,
        'https://codestral.mistral.ai/v1/chat/completions'
      );
      
      const brainstormedTasks = response.choices[0].message.content;
      console.log('Brainstorming completed. Tasks identified:', brainstormedTasks);
      return brainstormedTasks;
    } catch (error) {
      console.error('Error during LLM brainstorming:', error);
      return [];
    }
  }

  const brainstormedTasks = await brainstormTaskWithLLM(instruction);
  const content = `${brainstormedTasks}`
  try {


    await fsp.writeFile(path.join('..', 'content.txt'), content, 'utf8');
  } catch (error) {
    console.error('Error writing content to file:', error);
  }
  const messages = [
    {
      role: 'system',
      content: `Implement the following code changes using only tool calls: ${content}`
    },
    {
      role: 'user',
      content: diff
    }


  ];

  try {
    const response = await makeApiRequest(
      messages,
      getTools(),
      process.env.MISTRAL_API_KEY,
      'https://codestral.mistral.ai/v1/chat/completions'
    );
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        try {
          await executeToolCall(toolCall);
        } catch (error) {
          console.error('Tool call failed, restarting:', error);
          setTimeout(async () => {
            await main(instruction, error.message);
          }, 0);
          return;
        }
      }
    }
    if (response.choices[0].message.content) {
      const diffContent = response.choices[0].message.content;
      console.log('Received diff content from API, attempting to apply diff patch.');
      try {
        const tempDiffFile = path.join(process.cwd(), '.tmp_patch.diff');
        await fsp.writeFile(tempDiffFile, diffContent, 'utf8');
        console.log('Temporary diff file created at:', tempDiffFile);

        // Execute the patch command. (Using powershell syntax if needed.)
        const patchCmd = `patch -p1 < ${tempDiffFile}`;
        console.log('Executing patch command:', patchCmd);
        const patchResult = await executeCommand(patchCmd);
        if (patchResult.code !== 0) {
          console.error('Patch command failed with exit code:', patchResult.code);
          console.error('Patch STDOUT:', patchResult.stdout);
          console.error('Patch STDERR:', patchResult.stderr);
          throw new Error(`Patch command failed: ${patchResult.stderr || patchResult.stdout}`);
        }
        console.log('Diff patch applied successfully.');
        await fsp.unlink(tempDiffFile);
        console.log('Temporary diff file removed.');
      } catch (patchError) {
        console.error('Error applying diff patch:', patchError);
        throw patchError;
      }
    } else {
      console.log('No text found in the response to process as diff.');
    }
    console.log('Transformation complete!');
    
  } catch (error) {
    console.error('Error during transformation:', error);
  }
  try {
    const buildLogs = await runBuild();
    
    console.log('Build logs:', buildLogs);
  } catch (e) {
    //console.error('Error during rebuild:', e);
    setTimeout(async () => {
      await main(instruction, e.message);
    }, 0);

  }
}




const instruction = process.argv[2];
main(instruction).catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});

module.exports = { main };