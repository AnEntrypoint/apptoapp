#!/usr/bin/env node

const dotenv = require('dotenv');
const { getFiles, generateDiff, getDiffBufferStatus } = require('./files.js');
const { makeApiRequest, loadCursorRules } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const logger = require('./utils/logger');
dotenv.config();
let currentModel = 'mistral';

function setCurrentModel(model) {
  console.log('Setting current model to:', model);
  currentModel = model;
}

function getCurrentModel() {
  return currentModel;
}

function handleSpecialCommands(input) {
  // Function implementation
}

let testResults = {
};

async function runBuild() {
  let result;

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
  }

  const logBuffer = [];
  const logHandler = (data) => {
    logBuffer.push(data);
    logger.debug(data);
  };

  return new Promise((resolve, reject) => {
    let testProcess;

    testProcess = executeCommand('npx jest --detectOpenHandles --forceExit --testTimeout=10000 --maxWorkers=1 --passWithNoTests', logHandler);

    testProcess.then((result) => {

      if (result.code !== 0) {
        if (process.env.NODE_ENV === 'test') {

          // Modify the logHandler to capture test results
          const logHandler = (data) => {
            logBuffer.push(data);
            logger.debug(data);

            // Check for test results in the output
            if (data.includes('Tests:')) {
              const results = data.match(/(\d+) passed, (\d+) failed/);
              if (results) {
                testResults.passed = parseInt(results[1], 10);
                testResults.failed = parseInt(results[2], 10);
                logger.info(`Test Results - Passed: ${testResults.passed}, Failed: ${testResults.failed}`);
              }
            }
          };
          resolve(`Test failed with code ${result.code}`);
        } else {
          logger.error('Failed with exit code:', result.code);
          reject(new Error(`Test failed: ${result.stderr || result.stdout}`));
        }
      } else {
        resolve(`Test exit code: ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      }
    }).catch((error) => {
      reject(error);
    });
  });
}
let attempts = 0;
const summaryBuffer = [];
const cliBuffer = [];

async function brainstormTaskWithLLM(instruction, model, attempts, MAX_ATTEMPTS, errors) {
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

  const diffsXML = getDiffBufferStatus();
  const files = await getFiles();

  const artifacts = [
    `\n<userinstruction>${instruction}</userinstruction>\n`,
    files ? `\n${files}\n` : ``,
    summaryBuffer.length > 0 ? `\n${summaryBuffer.filter(s => s.trim() !== '').map((s, i) => `<attemptSummary number="${i}">${s}</attemptSummary>\n`).join('\n')}\n` : ``,
    `\n<nodeEnv>${process.env.NODE_ENV || 'development'}</nodeEnv>\n`,
    `\n<attempts>This is attempt number ${attempts} of ${MAX_ATTEMPTS} to complete the user instruction: ${instruction} and fix the errors in the logs and tests</attempts>\n`,
    `\n<nodeVersion>${process.version}</nodeVersion>\n`,
    `\n<npmVersion>${safeExecSync('npm -v')}</npmVersion>\n`,
    `\n<testResults>Passed ${testResults.passed} tests\nFailed to fix ${testResults.failed} tests</testResults>\n`,
    `\n<builderror>\n${errors}</buildError>\n`,
    `\n<installedDependencies>\n${safeExecSync('npm ls --depth=0')}\n</installedDependencies>\n`,
    `\n<gitStatus>\n${safeExecSync('git status --short 2>&1 || echo "Not a git repository"')}\n</gitStatus>\n`,
    `\n<gitBranch>${safeExecSync('git branch --show-current 2>&1 || echo "No branch"')}</gitBranch>\n`,
    `\n<systemDate>${new Date().toISOString()}</systemDate>\n`,
    `\n<timestamp>${new Date().toISOString()}</timestamp>\n`,
    `\n<currentWorkingDirectory>${process.cwd()}</currentWorkingDirectory>\n`,
    `\n<terminalType>${process.env.TERM || process.platform === 'win32' ? 'cmd/powershell' : 'bash'}</terminalType>\n`,
    cliBuffer.length > 0 ? `\n\n<bashhistory>${cliBuffer.map(c => c.replace(/<cli>/g, '').replace(/<\/cli>/g, '')).join('\n')}</bashhistory>\n` : ``,
    `\n<rules>Rules:\n${cursorRules}</rules>\n`,
    `\n${diffsXML}\n\n`,
  ]
  const messages = [
    {
      role: 'system',
      content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
        + '\n// Task Management\n'
        + `Always look at your progress using <attempts>, <attemptSummary>, <cmdhistory>, TODO.txt, CHANGELOG.txt and <diff> tags\n`
        + `Always pay special attention to <attemptDiff> tags, they are the most important part of the task, they are the difference between the current and the previous attempts, used to track progress\n`
        + `Always remove completed tasks from TODO.txt and move them to CHANGELOG.txt\n`
        + `Never repeat steps that are already listed in <attemptSummary> tags\n`
        + `Always avoid repeating steps - if issues persist that are already listed fixed in CHANGELOG.txt or if previous attempts appear in <diff>, <attemptHistory> and <cmdhistory> and tags, try a alternative approach and record what failed and why and how it failed in NOTES.txt for future iterations\n`
        + `If you cant make progress on an issue, or detect that you've fixed it more than once and its still broken, record what failed and why and how it failed, and a list of possible solutions in TODO.txt for future iterations, and add an <upgradeModel></upgradeModel> tag to the end of your response\n`
        + `Follow user requirements precisely and plan step-by-step, the users instructions are in <userinstruction>, thery are your primary goal, everything else is secondary\n`
        + `Always output your reasoning in <text> tags, as past tense as if the tasks have been completed\n`
        + '\n// Code Quality\n'
        + `Write clean, DRY, maintainable code following SOLID principles\n`
        + `Focus on readability and complete implementations\n`
        + `Use functional/declarative patterns and avoid classes\n`
        + `For TypeScript: Maintain strong type safety\n`
        + `For JavaScript: Use latest language features\n`
        + `Always refactor files with over 100 lines into smaller modules\n`
        + `Minimize interdependencies between functions\n`
        + `Maximise code reuse and generalization\n`

        + '\n// Testing & Debugging\n'
        + `The last build error is in <builderror>\n`
        + ``
        + `Write comprehensive unit and integration tests\n`
        + `Use tests to discover and fix bugs\n`
        + `Always try to fix all known errors at once\n`
        + `Always analyze logs, CHANGELOG.txt and <attemptDiff> tags as well as <cmdhistory> and <history> tags carefully to avoid repetitive fixes\n`
        + `Look at the logs and history, if the history indicates you are having trouble fixing the errors repeatedly, pick a different approach\n`
        + `Never run tests using the cli commands, they run automatically at the end of the process\n`
        + `always make 100% sure that none of the tests will get stuck, apply strategies to avoid that\n`
        + `IMPORTANT - never start the application by calling npm start, or npm run dev\n`

        + '\n// File Management\n'
        + `Use consistent file structure\n`
        + `Separate tests into their own folder\n`
        + `Only create necessary files in correct locations\n`
        + `Don't output unchanged files\n`

        + '\n// Dependency Management\n'
        + `Use CLI for package management with --save/--save-dev\n`
        + `Resolve conflicts by removing package-lock.json and reinstalling\n`

        + '\n// Documentation\n'
        + `Maintain clear JSDoc comments\n`
        + `Document user-facing text for i18n support\n`
        + `Explain changes in <text> tags with motivations and CLI commands, in past tense as if the tasks have been completed\n`

        + '\n// Output Formatting\n'
        + `Only respond in XML tags\n`
        + `Always write files with the following format: <file path="path/to/file.js">...</file>\n`
        + `Always perform CLI commands with the following format: <cli>command</cli>\n`
        + `Always provide the complete changed files, no partial files\n`

        + '\n// Performance & Security\n'
        + `Optimize performance while handling edge cases\n`
        + `Follow best practices for security and maintainability\n`
        + `Always Fix all test and linting errors\n`
    },
    {
      role: 'user',
      content: artifacts.join('\n'),
    },
  ];
  //debug
  const fs = require('fs');
  const path = require('path');
  const outputFilePath = path.join(__dirname, '../../lastprompt.txt');
  fs.writeFileSync(outputFilePath, messages[1].content);

  logger.success(`Messages have been written to ${outputFilePath}`);
  logger.debug(`${JSON.stringify(messages).length} B of reasoning input`);
  let retryCount = 0;
  const MAX_RETRIES = 3;

  while (retryCount < MAX_RETRIES) {
    try {
      const response = await makeApiRequest(
        messages,
        [],
        model === 'mistral' ? process.env.MISTRAL_API_KEY : process.env.GROQ_API_KEY,
        model === 'mistral' ? process.env.MISTRAL_CHAT_ENDPOINT : process.env.GROQ_CHAT_ENDPOINT,
        getCurrentModel(),
        (newModel) => {
          logger.info(`Updating model from ${getCurrentModel()} to ${newModel}`);
          setCurrentModel(newModel);
        }
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

async function main(instruction, errors, model = 'mistral') {
  console.log('Using model:', model);
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const MAX_ATTEMPTS = 20;
  setCurrentModel(model);

  try {
    if (!instruction || instruction.trim() === '') {
      logger.info('No specific instruction provided. Running default test mode.');
      instruction = 'Run project tests and verify setup';
    }

    // Validate API keys and select provider
    let apiKey;
    if (model === 'groq') {
      apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        logger.warn('No Groq API key found, checking alternatives...');
        const mistralKey = process.env.MISTRAL_API_KEY;
        const openrouterKey = process.env.OPENROUTER_API_KEY;
        if (openrouterKey) {
          logger.info('Found OpenRouter API key, using OpenRouter');
          setCurrentModel('openrouter');
          apiKey = openrouterKey;
        } else if (mistralKey) {
          logger.info('Found Mistral API key, falling back to Mistral');
          setCurrentModel('mistral');
          apiKey = mistralKey;
        }
      }
    } else if (model === 'mistral') {
      apiKey = process.env.MISTRAL_API_KEY;
    } else if (model === 'openrouter') {
      apiKey = process.env.OPENROUTER_API_KEY;
    }
 
    // Final validation
    if (!apiKey) {
      throw new Error(`No API key found for ${getCurrentModel()} provider`);
    }

    const files = await getFiles();
    logger.info(`\n\n--------------------------------\n\nUser instruction:\n\n--------------------------------\n${instruction}\n\n`);

    // In test mode, skip the LLM call and just write a test file
    if (process.env.NODE_ENV === 'test') {
      fs.writeFileSync('test.txt', 'test content');
      await generateDiff();
      return;
    }

    let brainstormedTasks;
    try {
      brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
    } catch (error) {
      if (error.message.includes('Invalid Groq API key') || 
          error.message.includes('unauthorized') ||
          error.message.includes('401')) {
        logger.error('Authentication error with Groq API. Falling back to Mistral...');
        setCurrentModel('mistral');
        brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
      } else if (error.message.includes('rate limit') || 
                 error.message.includes('429')) {
        logger.warn('Rate limit hit. Waiting before retry...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
      } else {
        throw error;
      }
    }

    if (!brainstormedTasks || typeof brainstormedTasks !== 'string') {
      if (process.env.NODE_ENV === 'test') {
        return; // In test environment, just return
      }
      throw new Error('Invalid response from LLM');
    }

    logger.debug(`${JSON.stringify(brainstormedTasks).length} B of reasoning output`);

    const filesToEdit = brainstormedTasks.match(/<file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/file>/gi) || [];
    const cliCommands = brainstormedTasks.match(/<cli>([\s\S]*?)<\/cli>/g) || [];
    const summaries = brainstormedTasks.match(/<text>([\s\S]*?)<\/text>/g) || [];

    if (cliCommands && cliCommands.length > 0) {
      cliBuffer.unshift(...cliCommands);
    }

    if (process.env.NODE_ENV !== 'test' && filesToEdit.length === 0 && cliCommands.length === 0 && summaries.length === 0) {
      logger.debug(brainstormedTasks);
      throw new Error('No files to edit, cli commands or summaries found');
    }

    const upgradeModelTag = brainstormedTasks.match(/<upgradeModel>/);
    if (upgradeModelTag) {
      logger.warn('Upgrade model tag found, switching to deepseek with fallback chain');
      let deepseekSuccess = false;
      
      // Try TogetherAI first
      if (!deepseekSuccess && process.env.TOGETHER_API_KEY) {
        logger.info('Attempting to use TogetherAI for deepseek...');
        setCurrentModel('together');
        try {
          brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
          logger.success('Successfully used TogetherAI for deepseek');
          deepseekSuccess = true;
        } catch (error) {
          logger.warn('TogetherAI failed:', error.message);
        }
      }

      // Try OpenRouter next if TogetherAI failed
      if (!deepseekSuccess && process.env.OPENROUTER_API_KEY) {
        logger.info('Attempting to use OpenRouter for deepseek...');
        setCurrentModel('openrouter');
        try {
          brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
          logger.success('Successfully used OpenRouter for deepseek');
          deepseekSuccess = true;
        } catch (error) {
          logger.warn('OpenRouter failed:', error.message);
        }
      }

      // Finally try Groq if both TogetherAI and OpenRouter failed
      if (!deepseekSuccess && process.env.GROQ_API_KEY) {
        logger.info('Attempting to use Groq as final fallback...');
        setCurrentModel('groq');
        try {
          brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
          logger.success('Successfully used Groq');
          deepseekSuccess = true;
        } catch (error) {
          logger.warn('Groq failed:', error.message);
          // If Groq fails, fall back to Mistral
          logger.warn('Failed with Groq provider, falling back to Mistral');
          logger.info('Updating model from groq to mistral');
          setCurrentModel('mistral');
          try {
            brainstormedTasks = await brainstormTaskWithLLM(instruction, getCurrentModel(), attempts, MAX_ATTEMPTS, errors);
            logger.success('Successfully used Mistral as final fallback');
            deepseekSuccess = true;
          } catch (error) {
            logger.error('Mistral fallback also failed:', error.message);
          }
        }
      }

      // If all providers failed, stay with current model
      if (!deepseekSuccess) {
        logger.warn('All deepseek providers failed, staying with current model');
        setCurrentModel(model);
      }
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
          cmdhistory.push(`Failed to write ${filePath}: ${error.message}`);
          //throw error;
        }
      }
    }

    if (cliCommands && cliCommands.length > 0) {
      for (const cliCommand of cliCommands) {
        const commandMatch = cliCommand.match(/<cli>([\s\S]*?)<\/cli>/);
        if (commandMatch) {
          const command = commandMatch[1].trim();
          try {
            const isBuildOrStartCommand = command.includes('npm run build') || command.includes('npm run start');
            if (!isBuildOrStartCommand) {
              const result = await executeCommand(command);
              logger.system("Code: ", result.code);
            } else {
              logger.info(`Skipped command: ${command} as it is a build or start command.`);
            }
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
      const results = await runBuild();
      if(results.code !== 0 || /error/i.test(results.stderr) || /fail/i.test(results.stderr)) {
        throw new Error('Build failed');
      }
      if (summaries && summaries.length > 0) {
        summaries.forEach((summary, index) => {
          console.log(`Attempt ${index + 1}: ${summary.replace(/<text>/g, '').replace(/<\/text>/g, '')}`);
        });
      }
      logger.success('Build successful', cmdhistory);

    } catch (error) {
      logger.error('Failed:', error, cmdhistory);
      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        if (summaries && summaries.length > 0) {
          const summaryString = summaries.map(s => s.replace(/<text>/g, '').replace(/<\/text>/g, '')).join('\n');
          summaryBuffer.push(summaryString);
        }
        summaryBuffer.push(`Attempt ${attempts}: Passed ${testResults.passed} tests\nFailed to fix ${testResults.failed} tests`);
        logger.info(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        main(process.argv[2], error.message, currentModel);
      } else {
        throw new Error('Max attempts reached');
      }
    }

    logger.debug('Final directory contents:', fs.readdirSync(process.cwd()));

  } catch (error) {
    console.error('Error:', error);
  }
}

// Parse command line arguments
program
  .argument('[instruction]', 'Instruction to execute')
  .option('-m, --model <type>', 'Model to use (mistral/groq)', 'mistral')
  .action((instruction, options) => {
    currentModel = options.model;
    main(instruction, null, currentModel).catch((error) => {
      console.error(error)
      logger.error('Application error:', error, error.message);
    });
  });

program.parse();

module.exports = {
  main,
  getCurrentModel: () => currentModel,
  setCurrentModel
};
