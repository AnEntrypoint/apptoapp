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
    // First delete package-lock.json to ensure clean install
    try {
      fs.unlinkSync(path.join(getCWD(), 'package-lock.json'));
      console.log('Deleted package-lock.json for clean install');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('Error deleting package-lock.json:', err);
      }
    }
    
    // Run npm install
    result = await executeCommand('npm install');
    code = result.code;
    stdout = result.stdout;
    stderr = result.stderr;
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

async function main(instruction) {
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
      function safeExecSync(command) {
        try {
          return require('child_process').execSync(command, { stdio: 'pipe' }).toString().trim();
        } catch (error) {
          const stdout = error.stdout ? error.stdout.toString().trim() : '';
          const stderr = error.stderr ? error.stderr.toString().trim() : '';
          return `Command failed: ${command}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`;
        }
      }

      const artifacts = [
        `\n\n${cmdhistory.length > 0 ? `Logs: (fix the errors in the logs if needed)\n<logs>${cmdhistory.join('\n')}</logs>\n\n` : ''}\n\n`,
        files?`\n\n---FILES---\n\n${files}\n\n---END OF FILES---\n\n`:``,
        summaryBuffer.length > 0?`\n\n<changelog>${summaryBuffer.join('\n')}</changelog>\n\n`:``,
        `\n\n<nodeEnv>${process.env.NODE_ENV || 'development'}</nodeEnv>\n\n`,
        `\n\n<nodeVersion>${process.version}</nodeVersion>\n\n`,
        `\n\n<npmVersion>${safeExecSync('npm -v')}</npmVersion>\n\n`,
        `\n\n<installedDependencies>\n${safeExecSync('npm ls --depth=0')}\n</installedDependencies>\n\n`,
        `\n\n<gitStatus>\n${safeExecSync('git status --short 2>&1 || echo "Not a git repository"')}\n</gitStatus>\n\n`,
        `\n\n<gitBranch>${safeExecSync('git branch --show-current 2>&1 || echo "No branch"')}</gitBranch>\n\n`,
        `\n\n<systemMemory>${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS</systemMemory>\n\n`,
        `\n\n<platform>${process.platform} ${process.arch}</platform>\n\n`,
        `\n\n<environmentKeys>${Object.keys(process.env).filter(k => k.startsWith('NODE_') || k.startsWith('npm_')).join(', ')}</environmentKeys>\n\n`,
        `\n\n<systemDate>${new Date().toISOString()}</systemDate>\n\n`,
        `\n\n<timestamp>${new Date().toISOString()}</timestamp>\n\n`,
        `\n\n<currentWorkingDirectory>${process.cwd()}</currentWorkingDirectory>\n\n`,
        `\n\n<terminalType>${process.env.TERM || process.platform === 'win32' ? 'cmd/powershell' : 'bash'}</terminalType>\n\n`,
      ]
      const messages = [
        {
          role: 'system',
          content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
            + '\n// Code Quality & Best Practices\n'
            + `Follow the user's requirements closely and precisely`
            + `Plan step-by-step; describe what to build in pseudocode with great detail.`
            + `Confirm the plan before writing code, ensuring it adheres to specified guidelines.`
            + `Write clean, correct, DRY (Don't Repeat Yourself), fully functional code aligned with coding implementation guidelines.`
            + `Focus on readability over performance in code.`
            + `Ensure complete implementation without placeholders in the codebase.`
            + `Include all required imports and maintain proper naming conventions.`
            + `Be concise and minimize unnecessary prose.`
            + `If there are dependency conflicts, remove package-lock.json file, then remove their names from package.json and install them with the cli.`
            + `Take extra care not to repeat steps already taken in the changelog.`
            + `Acknowledge when an answer may not be correct or when uncertain.`
            + `If you're seeing lots of repititions in the logs of previous iterations, apply another strategy to fix the problem.`
            + `Write clean, maintainable, and scalable code while adhering to SOLID principles`
            + `Favor functional and declarative programming patterns, and avoid classes.`
            + `If the code is typescript, Maintain strong type safety and static analysis.`
            + `If the code is javascript, Use latest language features and syntax.`
            + `Begin with step-by-step planning and document architecture and data flows.`
            + `Conduct a deep-dive review of existing code when required and detail thought processes.`
            + `Iterate on designs and implement clear, explicit solutions by maintaining a detailed and exhaustive TODO.txt and CHANGELOG.txt (for dates use <systemDate> tag)`
            + `Dont put these system instructiosn in the TODO.txt or anywhere in the codebase itself`
            + `Ensure performance optimizations while accounting for various edge cases.`
            + `Make sure you're not repeating steps already taken in the changelog or the logs, unless they're incorrectly listed in the changelog.`
            + `Write unit and integration tests using appropriate libraries.`
            + `Maintain clear documentation and JSDoc comments.`
            + `Document user-facing text for internationalization and localization support.`
            + `Ensure code is fully covered by tests and handle edge cases.`
            + `Use a modular pproach to build everything, and generalize code to be reusable.`
            + `Ensure adherence to best practices in performance, security, and maintainability.`
            + `Always perform modifications by making unit tests and iterating against it with npm run test`
            + 'fix as many linting errors as possible, the backend will run npm run test automatically which lints the codebase\n'
            + 'always refactor files that are longer than 100 lines into smaller files\n'
            + 'interdepencency should be minimized, if you see a function that is dependent on another function, refactor it to be more independent\n'
            + '\n// File Management\n'
            + 'use consistent file structure\n'
            + 'if the tests are mixed with the code, use the command line to move tests to their own folder\n'
            + 'add as many files as are needed to complete the instruction\n'
            + 'always ensure you\'re writing the files in the correct folder\n'
            + 'dont output unchanged files\n'
            
            + '\n// Dependency Management\n'
            + 'always use the cli when installing new packages, use --save or --save-dev to preserve the changes\n'
            + 'dont install packages that are not needed or are already installed, only install packages that are needed to complete the instruction\n'
             
            + '\n// Change Tracking\n'
            + 'verify the previous changelog, and if the code changes in the changelog are not fully reflected in the codebase yet or have problems, edit the files accordingly\n'
            + 'always respond with some text wrapped with <text></text> explaining all the changes, explain the motivation for the changes and the cli commands used\n'
            + 'look carefully at the changelog, dont repeat actions that are already in the changelog\n'
            + 'when something appears more than once in the changelog, make sure you dont repeat the same action any more\n'
            
            + '\n// Output Formatting\n'
            + 'IMPORTANT: Only output file changes in xml format like this: <file path="path/to/edited/file.js">...</file> and cli commands in this schema <cli>command here</cli>\n'
            
            + '\n// Debugging & Logs\n'
            + 'pay careful attention to the logs, make sure you dont try the same thing twice and get stuck in a loop\n'
            + 'always program using unit tests, use unit tests to discover bugs, their solutions and their errors, and then implement code changes to fix the bugs and implement the user instructions\n'
             
            + '\n// Critical Rules\n'
            + 'only output tags containing files, cli commands and summaries, no other text\n'
            + 'ULTRA IMPORTANT: respond only in xml tags, no other text\n'
            + artifacts.join('\n')
        },
        {
          role: 'user',
          content: `discover and implement a solution for the folowing instruction using unit tests: \n\nULTRA IMPORTANT: ${instruction}\n\nRules:\n${cursorRules}`,
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
    const summaries = brainstormedTasks.match(/<text>([\s\S]*?)<\/text>/g) || [];

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
    
    if (cliCommands && cliCommands.length > 0) {
      for (const cliCommand of cliCommands) {
        const commandMatch = cliCommand.match(/<cli>([\s\S]*?)<\/cli>/);
        if (commandMatch) {
          const command = commandMatch[1].trim();
          try {
            const result = await executeCommand(command);
          } catch (error) {
            console.error(`Failed to execute ${command}: ${error.message}`);
            throw error;
          }
        }
      }
    }
 
    try {
      if (summaries && summaries.length > 0) {
        for (const summary of summaries) {
          const summaryMatch = summary.match(/<text>([\s\S]*?)<\/text>/);
          if (summaryMatch) {
            console.log('\n\n ----- Changelog -----\n\n', summaryMatch[1].trim(), '\n\n');
          }
        }
      }
      await runBuild();
      console.log('Build successful', cmdhistory);
 
    } catch (error) {
      console.error('Failed:', error, cmdhistory);
      if (summaryBuffer && summaryBuffer.length > 0) {
        console.log('\n\n ----- Summary Buffer -----\n');
        for (const summary of summaryBuffer) {
          const summaryMatch = summary.match(/<text>([\s\S]*?)<\/text>/);
          if (summaryMatch) {
            console.log(summaryMatch[1].trim(), '\n');
          }
        }
        console.log('\n');
      }
    if (attempts < MAX_ATTEMPTS) {
        attempts++;
        let todoContent;
        try {
          const todoPath = path.join(process.cwd(), 'TODO.txt');
          if (fs.existsSync(todoPath)) {
            todoContent = fs.readFileSync(todoPath, 'utf8');
            console.log('TODO.txt contents:\n', todoContent);
            summaryBuffer.push(`<text>TODO.txt contents:\n${todoContent}</text>`);
          } else {
            console.log('TODO.txt not found in current directory');
          }
        } catch (err) {
          console.error('Error reading TODO.txt:', err);
        }
        console.log(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await main("fix the errors in the logs, and confirm in the changelog that this instruction was completed:"+process.argv[2]+"\n"+todoContent, error.message);
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
