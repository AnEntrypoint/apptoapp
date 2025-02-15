#!/usr/bin/env node

const dotenv = require('dotenv');
const { getFiles, writeFile } = require('./files.js');
const { makeApiRequest, loadCursorRules, getCWD } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');
const fs = require('fs');
const path = require('path');

dotenv.config();

const TEST_TIMEOUT = process.env.CI ? 300000 : 180000; // 5 minutes for CI, 3 minutes locally

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
  const logBuffer = [];
  const logHandler = (data) => {
    logBuffer.push(data);
    console.log(data);
  };
 
  return new Promise((resolve, reject) => {
    let timeoutId;
    let testProcess;
    let isTimedOut = false;
    let processKilled = false;

    const killWithRetry = async (pid, attempts = 3) => {
      for (let i = 1; i <= attempts; i++) {
        try {
          console.log(`Attempt ${i} to kill process group ${pid}`);
          process.kill(-pid, 'SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Verify if process exists
          process.kill(pid, 0); // Throws if process doesn't exist
        } catch (err) {
          console.log(`Process group ${pid} successfully terminated`);
          return true;
        }
      }
      return false;
    };

    const handleTimeout = () => {
      console.log(`Test timeout after ${TEST_TIMEOUT}ms - initiating cleanup`);
      isTimedOut = true;
      
      if (testProcess?.childProcess) {
        const pid = testProcess.childProcess.pid;
        console.log(`Terminating process tree for PID: ${pid}`);
        
        // Windows needs extra time for process tree termination
        const cleanupTimer = setTimeout(() => {
          console.log('Final force exit');
          process.exit(1);
        }, 30000); // 30 second cleanup window

        killWithRetry(pid).finally(() => {
          clearTimeout(cleanupTimer);
          resolve(`Tests timed out after ${TEST_TIMEOUT}ms`);
        });
      }
    };

    testProcess = executeCommand('npx jest --detectOpenHandles --forceExit --testTimeout=120000 --maxWorkers=1', logHandler);
    
    // Add universal timeout handling regardless of NODE_ENV
    timeoutId = setTimeout(handleTimeout, TEST_TIMEOUT);

    // Add forced process termination for all environments
    const forceKill = () => {
      console.log('Initiating forced process termination');
      if (testProcess?.childProcess) {
        testProcess.childProcess.kill('SIGKILL');
      }
      // Add final cleanup for child processes
      setTimeout(() => process.exit(0), 5000);
    };

    // Add secondary timeout for guaranteed exit
    const finalExitTimer = setTimeout(() => {
      console.error('FINAL FORCED EXIT - PROCESS HUNG');
      forceKill();
    }, TEST_TIMEOUT + 60000); // Add 1 minute buffer to initial timeout

    // Cleanup timers when process completes
    testProcess.finally(() => {
      clearTimeout(timeoutId);
      clearTimeout(finalExitTimer);
    });

    testProcess.then((result) => {
      if (isTimedOut) return; // Ignore if already timed out
      if (timeoutId) clearTimeout(timeoutId);
      
      if (result.code !== 0) {
        if (process.env.NODE_ENV === 'test') {
          resolve(`Test failed with code ${result.code}`);
        } else {
          console.error('Failed with exit code:', result.code);
          reject(new Error(`Test failed: ${result.stderr || result.stdout}`));
        }
      } else {
        resolve(`Test exit code: ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      }
    }).catch((error) => {
      if (isTimedOut) return; // Ignore if already timed out
      if (timeoutId) clearTimeout(timeoutId);
      reject(error);
    });
  });
}
let attempts = 0;
const summaryBuffer = [];
const cliBuffer = [];
async function main(instruction, errors) {
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const MAX_ATTEMPTS = 20;

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

      // Add deduplication function
      async function deduplicateContentWithLLM(content) {
        try {
          console.log('Deduplicating summary buffer (length:', content.length, ')');
          const response = await makeApiRequest(
            [{
              role: "system",
              content: "Remove duplicate lines from this content while maintaining order. Only respond with the deduplicated text."
            }, {
              role: "user",
              content: content.join('\n')
            }],
            [],
            process.env.MISTRAL_API_KEY,
            'https://codestral.mistral.ai/v1/chat/completions'
          );
          return response.choices[0].message.content.split('\n');
        } catch (error) {
          console.error('Deduplication failed, using original content:', error.message);
          return content; // Fallback to original content
        }
      }

      // Process summary buffer before using
      let processedHistory = [];
      if (summaryBuffer.length > 0) {
        console.log('Pre-processing summary buffer (original length:', summaryBuffer.length, ')');
        try {
          if (!process.env.MISTRAL_API_KEY) throw new Error('No API key for deduplication');
          processedHistory = await deduplicateContentWithLLM([...new Set(summaryBuffer)]);
          summaryBuffer.length = 0; // Clear original buffer
          summaryBuffer.push(...processedHistory); // Replace with deduplicated
          console.log('Deduplicated summary buffer (new length:', processedHistory.length, ')');
        } catch (error) {
          console.error('Summary processing error:', error.message);
          processedHistory = summaryBuffer;
        }
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
        //`\n\n${cmdhistory.length > 0 ? `Logs: (fix the errors in the logs if needed)\n<logs>${cmdhistory.join('\n')}</logs>\n\n` : ''}\n\n`,
        files?`\n\n---FILES---\n\n${files}\n\n---END OF FILES---\n\n`:``,
        processedHistory.length > 0 ? `\n\n<history>${processedHistory.join('\n')}</history>\n\n` : ``,
        `\n\n<nodeEnv>${process.env.NODE_ENV || 'development'}</nodeEnv>\n\n`,
        `\n\n<attempts>This is attempt number ${attempts} of ${MAX_ATTEMPTS} to complete the user instruction: ${instruction} and fix the errors in the logs and tests</attempts>\n\n`,
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
        errors?`\n\n<errors>${errors}</errors>\n\n`:``,
        `\n\n<currentWorkingDirectory>${process.cwd()}</currentWorkingDirectory>\n\n`,
        `\n\n<terminalType>${process.env.TERM || process.platform === 'win32' ? 'cmd/powershell' : 'bash'}</terminalType>\n\n`,
        cliBuffer.length > 0?`\n\n<bashhistory>${cliBuffer.map(c=>c.replace(/<cli>/g, '').replace(/<\/cli>/g, '')).join('\n')}</bashhistory>\n\n`:``,
        `\n\n<rules>Rules:\n${cursorRules}</rules>\n\n`,
      ]
      const messages = [
        {
          role: 'system',
          content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
            + '\n// Code Quality & Best Practices\n'
            + `It is possible that you are in the middle of a task, look at <attempts></attempts> and <todo></todo> and <logs></logs>, as well as TODO.txt and CHANGELOG.txt to see what you have already done and what you need to do, dont repeat steps that were already perofrmed`
            + `the primary instruction is the user message`
            + `Follow the user's requirements closely and precisely`
            + `Plan step-by-step; describe what to build in pseudocode with great detail.`
            + `Confirm the plan before writing code, ensuring it adheres to specified guidelines.`
            + `Write clean, correct, DRY (Don't Repeat Yourself), fully functional code aligned with coding implementation guidelines.`
            + `Focus on readability over performance in code.`
            + `Ensure complete implementation without placeholders in the codebase.`
            + `Include all required imports and maintain proper naming conventions.`
            + `Always resolve all the issues reported in the logs and unit tests or add them to the TODO.txt file.`
            + `If there are dependency conflicts, remove package-lock.json file, uninstall all related packages from package.json and install them with the cli in the correct order to resolve the conflicts`
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
            + 'always respond with some text wrapped with <text></text> explaining all the changes for each file, explain the motivation for the changes and the cli commands used\n'
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
            + 'ULTRA IMPORTANT: only respond in complete files, dont leave anything out\n'
            + artifacts.join('\n')
        },
        {
          role: 'user',
          content: `${instruction}`,
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

    if (cliCommands && cliCommands.length > 0) {
      cliBuffer.unshift(...cliCommands);
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
            console.log({result})
          } catch (error) {
            console.error(`Failed to execute ${command}: ${error.message}`);
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
            summaryBuffer.push(`${todoContent}`);
          } else {
            console.log('TODO.txt not found in current directory');
          }
        } catch (err) {
          console.error('Error reading TODO.txt:', err);
        }
        console.log(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await main(process.argv[2], error.message);
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
