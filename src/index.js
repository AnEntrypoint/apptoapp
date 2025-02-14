#!/usr/bin/env node

const dotenv = require('dotenv');
const { getFiles, writeFile } = require('./files.js');
const { makeApiRequest, loadCursorRules, getCWD } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');
const fs = require('fs');
const path = require('path');

dotenv.config();


async function runBuild() {
  let result; let code; let stdout; let
    stderr;

  // Only run npm upgrade in non-test environment
  if (process.env.NODE_ENV !== 'test') {
    result = await executeCommand('npm upgrade --save');
    code = result.code;
    stdout = result.stdout;
    stderr = result.stderr;
    if (code !== 0) {
      throw new Error(`Test failed: ${stderr || stdout}`);
    }
  }

  const timeoutDuration = process.env.NODE_ENV === 'test' ? 5000 : 10000;
  let lastLogTime = Date.now();
  const logBuffer = [];
  const logHandler = (data) => {
    if (process.env.NODE_ENV === 'test') {
      logBuffer.push(data);
    } else {
      console.log(data);
    }
    lastLogTime = Date.now();
  };
 
  return new Promise((resolve, reject) => {
    let timeoutId;
    const testProcess = executeCommand('npm run test', logHandler);

    if (process.env.NODE_ENV !== 'test') {
      timeoutId = setTimeout(() => {
        console.log('Test command timed out');
        testProcess.then((result) => {
          result.kill();
          
          throw new Error('Test command timed out');
        }).catch(reject);
      }, timeoutDuration);
    }

    testProcess.then((result) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (result.code !== 0) {
        if (process.env.NODE_ENV === 'test') {
          resolve(`Test failed with code ${result.code}`);
        } else {
          console.error('Failed with exit code:', result.code);
          console.error('STDOUT:', result.stdout);
          console.error('STDERR:', result.stderr);
          reject(new Error(`Test failed: ${result.stderr || result.stdout}`));
        }
      } else {
        resolve(`Test exit code: ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      }
    }).catch((error) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}
let attempts = 0;

async function main(instruction, previousLogs) {
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const MAX_ATTEMPTS = 20;
  const summaryBuffer = [];

  try {
    // Immediate test of file writing
    
    if (!instruction || instruction.trim() === '') {
      console.log('No specific instruction provided. Running default test mode.');
      instruction = 'Run project tests and verify setup';
    }

    const files = await getFiles();
    console.log(`\n\n--------------------------------\n\nUser instruction:\n\n--------------------------------\n${instruction}\n\n`);
    async function brainstormTaskWithLLM(instruction) {
      const cursorRules = await loadCursorRules();
      if (cmdhistory.length > 0) {
        const newcmdhistory = cmdhistory.join('\n').split('\n').slice(cmdhistory.length - 1000, cmdhistory.length).join('\n');
        cmdhistory.length = 0;
        cmdhistory.unshift(newcmdhistory);
      }
      const artifacts = [
         `\n\n${cmdhistory.length > 0 ? `Logs: (fix the errors in the logs if needed)\n<logs>${cmdhistory.join('\n')}</logs>\n\n` : ''}\n\n`,
         `\n\n${(previousLogs && previousLogs.length) > 0 ? `Previous Logs: (fix the errors in the logs if needed)\n<logs>${previousLogs}</logs>\n\n` : ''}\n\n`,
         `\n\nFiles:\n\n${files}\n\n`,
         `\n\n<changelog>${summaryBuffer.join('\n')}</changelog>\n\n`
      ]
      const messages = [
        {
          role: 'system',
          content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
            + '\n// Code Quality & Best Practices\n'
            + 'IMPORTANT: always discover and solve all solutions by writing unit tests\n'
            + 'fix as many linting errors as possible, the backend will run npm run test automatically which lints the codebase\n'
            + 'always refactor files that are longer than 100 lines into smaller files\n'
            
            + '\n// File Management\n'
            + 'add as many files as are needed to complete the instruction\n'
            + 'always ensure you\'re writing the files in the correct folder\n'
            + 'dont output unchanged files\n'
            
            + '\n// Dependency Management\n'
            + 'always use the cli when installing new packages, use --save or --save-dev to preserve the changes\n'
            
            + '\n// Change Tracking\n'
            + 'verify the previous changelog, and if the code changes in the changelog are not reflected in the codebase, edit the files accordingly\n'
            + 'always add a changelog with <changelog>changelog here</changelog> at the end of your output\n'
            
            + '\n// Output Formatting\n'
            + 'IMPORTANT: Only output file changes in xml format like this: <file path="path/to/edited/file.js">...</file> and cli commands in this schema <cli>command here</cli>\n'
            
            + '\n// Debugging & Logs\n'
            + 'pay careful attention to the logs, make sure you dont try the same thing twice and get stuck in a loop\n'
            
            + '\n// Critical Rules\n'
            + 'only output tags containing files, cli commands and summaries, no other text\n'
            + 'ULTRA IMPORTANT: make sure you dont regress any parts of any file, features, depedencies and settings need to remain if they\'re used in the codebase\n'
            + artifacts.join('\n')
        },
        {
          role: 'user',
          content: `discover and implement a solution for the folowing instruction using unit tests: ${instruction}\n\nRules:\n${cursorRules}`,
        },
      ];
      //debug
      const fs = require('fs');
      const path = require('path');
      const outputFilePath = path.join(__dirname, '../../lastprompt.txt');
      fs.writeFileSync(outputFilePath, messages[0].content);

      console.log(`Messages have been written to ${outputFilePath}`);
      console.log(`${JSON.stringify(messages).length} B of reasoning input`);
      while (retryCount < MAX_RETRIES) {
        try {
          const response = await makeApiRequest(
            messages,
            [],
            process.env.MISTRAL_API_KEY,
            'https://codestral.mistral.ai/v1/chat/completions',
          );

          return response.choices[0].message.content;
        } catch (error) {
          console.error(`API request failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            throw error;
          }
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
        }
      }
      return [];
    }

    const brainstormedTasks = await brainstormTaskWithLLM(instruction);
    if (!brainstormedTasks || typeof brainstormedTasks !== 'string') {
      if (process.env.NODE_ENV === 'test') {
        return; // In test environment, just return
      }
      throw new Error('Invalid response from LLM');
    }

    console.log(`${JSON.stringify(brainstormedTasks).length} B of reasoning output`);

    const filesToEdit = brainstormedTasks.match(/<file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/gi) || [];
    const cliCommands = brainstormedTasks.match(/<cli>([\s\S]*?)<\/cli>/g) || [];
    const summaries = brainstormedTasks.match(/<summary>([\s\S]*?)<\/summary>/g) || [];
    
    if (summaries && summaries.length > 0) {
      summaryBuffer.unshift(...summaries);
    }

    if (process.env.NODE_ENV !== 'test' && filesToEdit.length === 0 && cliCommands.length === 0 && summaries.length === 0) {
      console.log(brainstormedTasks);
      throw new Error('No files to edit, cli commands or summaries found');
    }

    if (filesToEdit && filesToEdit.length > 0) {
      for (const file of filesToEdit) {
        const fileMatch = file.match(/<file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/);
        if (!fileMatch || fileMatch.length < 3) continue;
        
        const filePath = fileMatch[1];
        const fileContent = fileMatch[2];
        
        console.log(`[FS] Writing ${filePath} (${fileContent.length} bytes)`);
        try {
          const fullPath = path.join(process.cwd(), filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, fileContent);
          console.log(`[FS] Successfully wrote ${filePath}`);
        } catch (error) {
          console.error(`Failed to write ${filePath}: ${error.message}`);
          throw error;
        }
      }
    }

    if (summaries && summaries.length > 0) {
      for (const summary of summaries) {
        const summaryMatch = summary.match(/<summary>([\s\S]*?)<\/summary>/);
        if (summaryMatch) {
          console.log('Summary:', summaryMatch[1].trim());
        }
      }
    }
    
    if (cliCommands && cliCommands.length > 0) {
      for (const cliCommand of cliCommands) {
        const commandMatch = cliCommand.match(/<cli>([\s\S]*?)<\/cli>/);
        if (commandMatch) {
          const command = commandMatch[1].trim();
          console.log('Executing:', command);
          await executeCommand(command);
        }
      }
    }

    try {
      await runBuild();
      console.log('Build successful', cmdhistory);

    } catch (error) {
      console.error('Failed:', error);
      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        console.log(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await main("fix the errors in the logs, and confirm in the summary that this instruction was completed:"+process.argv[2], error.message);
      } else {
        throw new Error('Max attempts reached');
      }
    }

    console.log('Final directory contents:', fs.readdirSync(process.cwd()));
  } catch (error) {
    console.error('Application error:', error);
    if (process.env.NODE_ENV === 'test') {
      throw error; // In test environment, propagate the error
    } else {
      process.exit(1);
    }
  }
}

const instruction = process.argv[2];
main(instruction).catch((error) => {
  console.error('Application error:', error);
  process.exit(0);
});

module.exports = {
  main
};
