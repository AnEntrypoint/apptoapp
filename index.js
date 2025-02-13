#!/usr/bin/env node
const { getFiles } = require('./files.js');
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
    console.error('Error listing files: %O', error);
    throw error;
  }
}

async function runBuild() {
  let result, code, stdout, stderr;
  result = await executeCommand('npm upgrade --save');
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;
  if (code !== 0) {
    throw new Error(`Build failed: ${stderr || stdout}`);
  }

  /*result = await executeCommand('npm run lint');
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;
  console.log('Lint result:', result);
  if (code) {
    console.error('Lint failed with exit code:', code);
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    throw new Error(`Lint failed: ${stderr || stdout}`);
  }*/

  result = await executeCommand('npm run test'); 
  code = result.code;
  stdout = result.stdout;
  stderr = result.stderr;
  if (code) {
    console.error('Build failed with exit code:', code);
    console.error('STDOUT:', stdout);
    console.error('STDERR:', stderr);
    throw new Error(`Build failed: ${stderr || stdout}`);
  }
  process.exit(1);
  return `Build exit code: ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
}
let count = 0;
async function main(instruction, previousLogs = '') {
  if(count++ > 5){
    console.error('Too many attempts, exiting');
    process.exit(1);
  }


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
  

  let diff = await getFiles('.');
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
        content: `You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction`+
        `avoid editing the frameworks configuration files or any settings file when possible\n`+
        `always discover and solve all errors by writing unit tests\n`+
        `add as many files as are needed to complete the instruction\n`+
        `pay careful attention to the logs, make sure you dont try the same thing twice and get stuck in a loop\n`+
        `only mention files that were edited\n`+
        `${cmdhistory.length > 0 ? 'Logs: (fix the errors in the logs if needed)\n'+cmdhistory.join('\n')+'\n' : ''}`+
        `Files:\n\n${diff}`
      },
      {
        role: 'user',
        content: instruction
      }
    ];
    try {
      const response = await makeApiRequest(
        messages,
        [],
        process.env.MISTRAL_API_KEY,
        'https://codestral.mistral.ai/v1/chat/completions'
      );
      
      const brainstormedTasks = response.choices[0].message.content.replace(/```diff\n/g, '').replace(/```/g, '');
      console.log({brainstormedTasks});
      return brainstormedTasks;
    } catch (error) {
      console.error('Error during LLM brainstorming:', error);
      return [];
    }
  }

 const brainstormedTasks = await brainstormTaskWithLLM(instruction);
  const content = brainstormedTasks
  try {
    await fsp.writeFile(path.join('..', 'content.txt'), content, 'utf8');
  } catch (error) {
    console.error('Error writing content to file:', error);
  }
  const messages = [
    {
      role: 'system',
      content: `Respond only in multiple tool calls to write all the listed files, follow that with any cli commands to run, and finally call the explanation tool to report to the user.`
    },
    {
      role: 'user',
      content: content
    }
  ];

  try {
    const response = await makeApiRequest(
      messages,
      getTools(),
      process.env.MISTRAL_API_KEY,
      'https://codestral.mistral.ai/v1/chat/completions'
    );

    //console.log('Response:', response.choices[0]);
    //console.log('Tools:', response.choices[0].message.tool_calls.map(t => t.function.name));
    //process.exit(1);
    if (response.choices[0].message.tool_calls) {
      for (const toolCall of response.choices[0].message.tool_calls) {
        try {
          //console.log('Executing tool call:', toolCall);
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
    //console.log('Transformation complete!'); 

  } catch (error) {
    console.error('Error during transformation:', error);
  }
  try {
    const buildLogs = await runBuild();
    
    console.log('Build logs:', buildLogs);
  } catch (e) {
    console.error('Error during rebuild:', e);
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