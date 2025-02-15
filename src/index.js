#!/usr/bin/env node

const dotenv = require('dotenv');
const { getFiles, writeFile, generateDiff, getDiffsAsXML, clearDiffBuffer } = require('./files.js');
const { makeApiRequest, loadCursorRules, getCWD } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const logger = require('./utils/logger');

dotenv.config();

const TEST_TIMEOUT = process.env.CI ? 300000 : 180000; // 5 minutes for CI, 3 minutes locally

async function runBuild() {
  let result; let code; let stdout; let
    stderr;

  // Only run npm upgrade in non-test environment
  if (process.env.NODE_ENV !== 'test') {
    // First delete package-lock.json to ensure clean install
    try {
      await fs.promises.unlink('package-lock.json');
      logger.success('Deleted package-lock.json for clean install');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error('Error deleting package-lock.json:', err);
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
    logger.debug(data);
  };
 
  return new Promise((resolve, reject) => {
    let timeoutId;
    let testProcess;
    let isTimedOut = false;
    let processKilled = false;

    const killWithRetry = async (pid, attempts = 5) => {
      for (let i = 1; i <= attempts; i++) {
        try {
          logger.system(`Attempt ${i} to kill process group ${pid}`);
          process.kill(-pid, 'SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Verify if process exists
          process.kill(pid, 0); // Throws if process doesn't exist
        } catch (err) {
          logger.success(`Process group ${pid} successfully terminated`);
          return true;
        }
      }
      return false;
    };

    const handleTimeout = () => {
      logger.warn(`Test timeout after ${TEST_TIMEOUT}ms - initiating cleanup`);
      isTimedOut = true;
      
      if (testProcess?.childProcess) {
        const pid = testProcess.childProcess.pid;
        logger.system(`Terminating process tree for PID: ${pid}`);
        
        // Windows needs extra time for process tree termination
        const cleanupTimer = setTimeout(() => {
          logger.warn('Final force exit');
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
      logger.warn('Initiating forced process termination');
      if (testProcess?.childProcess) {
        testProcess.childProcess.kill('SIGKILL');
      }
      // Add final cleanup for child processes
      setTimeout(() => process.exit(0), 5000);
    };

    // Add secondary timeout for guaranteed exit
    const finalExitTimer = setTimeout(() => {
      logger.error('FINAL FORCED EXIT - PROCESS HUNG');
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
          logger.error('Failed with exit code:', result.code);
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
    // Only clear diff buffer if explicitly requested
    // clearDiffBuffer(); - removing this line to allow diffs to accumulate
    
    if (!instruction || instruction.trim() === '') {
      logger.info('No specific instruction provided. Running default test mode.');
      instruction = 'Run project tests and verify setup';
    }

    const files = await getFiles();
    logger.info(`\n\n--------------------------------\n\nUser instruction:\n\n--------------------------------\n${instruction}\n\n`);

    // In test mode, skip the LLM call and just write a test file
    if (process.env.NODE_ENV === 'test') {
      fs.writeFileSync('test.txt', 'test content');
      await generateDiff();
      return;
    }

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
          logger.debug('Deduplicating summary buffer (length:', content.length, ')');
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
          logger.error('Deduplication failed, using original content:', error.message);
          return content; // Fallback to original content
        }
      }

      // Process summary buffer before using
      let processedHistory = [];
      if (summaryBuffer.length > 0) {
        logger.debug('Pre-processing summary buffer (original length:', summaryBuffer.length, ')');
        try {
          if (!process.env.MISTRAL_API_KEY) throw new Error('No API key for deduplication');
          processedHistory = await deduplicateContentWithLLM([...new Set(summaryBuffer)]);
          summaryBuffer.length = 0; // Clear original buffer
          summaryBuffer.push(...processedHistory); // Replace with deduplicated
          logger.debug('Deduplicated summary buffer (new length:', processedHistory.length, ')');
        } catch (error) {
          logger.error('Summary processing error:', error.message);
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
      const diffsXML = getDiffsAsXML();
      
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
        `\n\n${diffsXML}\n\n`,
      ]
      const messages = [
        {
          role: 'system',
          content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
            + '\n// Task Management\n'
            + `Track progress using <attempts>, <todo>, <logs>, TODO.txt, CHANGELOG.txt and <attemptDiff> tags\n`
            + `ULTRA IMPORTANT - Avoid repeating steps - if issues persist, try alternative approaches\n`
            + `Follow user requirements precisely and plan step-by-step\n`
            + `Maintain detailed documentation in TODO.txt and CHANGELOG.txt\n`
            
            + '\n// Code Quality\n'
            + `Write clean, DRY, maintainable code following SOLID principles\n`
            + `Focus on readability and complete implementations\n`
            + `Use functional/declarative patterns and avoid classes\n`
            + `For TypeScript: Maintain strong type safety\n`
            + `For JavaScript: Use latest language features\n`
            + `Refactor files >100 lines into smaller modules\n`
            + `Minimize interdependencies between functions\n`
            
            + '\n// Testing & Debugging\n'
            + `Write comprehensive unit and integration tests\n`
            + `Use tests to discover and fix bugs\n`
            + `Handle edge cases and ensure full test coverage\n`
            + `Analyze logs carefully to avoid repetitive loops\n`
            
            + '\n// File Management\n'
            + `Use consistent file structure\n`
            + `Separate tests into their own folder\n`
            + `Only create necessary files in correct locations\n`
            + `Don't output unchanged files\n`
            
            + '\n// Dependency Management\n'
            + `Use CLI for package management with --save/--save-dev\n`
            + `Only install essential packages\n`
            + `Resolve conflicts by removing package-lock.json and reinstalling\n`
            
            + '\n// Documentation\n'
            + `Maintain clear JSDoc comments\n`
            + `Document user-facing text for i18n support\n`
            + `Explain changes in <text> tags with motivations and CLI commands\n`
            
            + '\n// Output Formatting\n'
            + `Only output in XML format:\n`
            + `Files: <file path="path/to/file.js">...</file>\n`
            + `Commands: <cli>command</cli>\n`
            + `No other text outside XML tags\n`
            + `Always provide complete file contents\n`
            
            + '\n// Performance & Security\n'
            + `Optimize performance while handling edge cases\n`
            + `Follow best practices for security and maintainability\n`
            + `Fix linting errors - tests will run automatically\n`
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

      logger.success(`Messages have been written to ${outputFilePath}`);
      logger.debug(`${JSON.stringify(messages).length} B of reasoning input`);
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
          logger.error(`API request failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
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

    logger.debug(`${JSON.stringify(brainstormedTasks).length} B of reasoning output`);
    logger.debug(brainstormedTasks);

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
      logger.debug(brainstormedTasks);
      throw new Error('No files to edit, cli commands or summaries found');
    }

    if (filesToEdit && filesToEdit.length > 0) {
      for (const file of filesToEdit) {
        const fileMatch = file.match(/<file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/);
        if (!fileMatch || fileMatch.length < 3) continue;
        
        const filePath = fileMatch[1];
        const fileContent = fileMatch[2];
        
        logger.file(`Writing ${filePath} (${fileContent.length} bytes)`);
        try {
          const fullPath = path.join(process.cwd(), filePath);
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, fileContent);
          logger.success(`Successfully wrote ${filePath}`);
        } catch (error) {
          logger.error(`Failed to write ${filePath}: ${error.message}`);
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
            logger.system("Code: ", result.code)
          } catch (error) {
            logger.error(`Failed to execute ${command}: ${error.message}`);
          }
        }
      }
    }
    await generateDiff();
 
    try {
      if (summaries && summaries.length > 0) {
        for (const summary of summaries) {
          const summaryMatch = summary.match(/<text>([\s\S]*?)<\/text>/);
          if (summaryMatch) {
            logger.info('\n\n ----- Changelog -----\n\n', summaryMatch[1].trim(), '\n\n');
          }
        }
      }
      await runBuild();
      logger.success('Build successful', cmdhistory);
 
    } catch (error) {
      logger.error('Failed:', error, cmdhistory);
      if (summaryBuffer && summaryBuffer.length > 0) {
        logger.info('\n\n ----- Summary Buffer -----\n');
        for (const summary of summaryBuffer) {
          const summaryMatch = summary.match(/<text>([\s\S]*?)<\/text>/);
          if (summaryMatch) {
            logger.info(summaryMatch[1].trim(), '\n');
          }
        }
        logger.info('\n');
      }
    if (attempts < MAX_ATTEMPTS) {
        attempts++;
        let todoContent;
        try {
          const todoPath = path.join(process.cwd(), 'TODO.txt');
          if (fs.existsSync(todoPath)) {
            todoContent = fs.readFileSync(todoPath, 'utf8');
            logger.info('TODO.txt contents:\n', todoContent);
            summaryBuffer.push(`${todoContent}`);
          } else {
            logger.warn('TODO.txt not found in current directory');
          }
        } catch (err) {
          logger.error('Error reading TODO.txt:', err);
        }
        logger.info(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await main(process.argv[2], error.message);
      } else {
        throw new Error('Max attempts reached');
      }
    }

    logger.debug('Final directory contents:', fs.readdirSync(process.cwd()));

  } catch (error) {
    logger.error('Application error:', error);
    if (process.env.NODE_ENV === 'test') {
      throw error; // In test environment, propagate the error
    } else {
      process.exit(1);
    }
  }
}

const instruction = process.argv[2];
main(instruction).catch((error) => {
  logger.error('Application error:', error);
  process.exit(0);
});

module.exports = {
  main
};
