#!/usr/bin/env node

const dotenv = require('dotenv');
const { getFiles, generateDiff, getDiffBufferStatus } = require('./files.js');
const { makeApiRequest, loadCursorRules } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const logger = require('./utils/logger');
dotenv.config({ path: path.join(process.cwd(), '.env') });
let currentModel = 'mistral';

function setCurrentModel(model) {
  console.log('Setting current model to:', model);
  currentModel = model;
}

function getCurrentModel() {
  return currentModel;
}

async function runBuild() {
  let lint;
  let test;
  try {
    await executeCommand('npm install');
  } catch (error) {
    logger.error('Error executing npm install:', error.message);
  }
  try {
    lint = await executeCommand('npm run lint --fix', false);    
  } catch (error) {
    logger.error('Error executing npm install:', error.message);
  }
  try {
    test = await executeCommand('npm run test', false);
  } catch (error) {
    logger.error('Error executing npm install:', error.message);
  }
  try {

    return {lint:`Exit code: ${lint.code}\nSTDOUT:\n${lint.stdout}\nSTDERR:\n${lint.stderr}`, test:`Exit code: ${test.code}\nSTDOUT:\n${test.stdout}\nSTDERR:\n${test.stderr}`};
  } catch (error) {
    logger.error('Error executing lint command:', error.message);
    return 'Failed to execute lint command gracefully.';
  }
}

let attempts = 0;
const summaryBuffer = [];

async function brainstormTaskWithLLM(instruction, model, attempts, MAX_ATTEMPTS, errors) {
  const cursorRules = await loadCursorRules();

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
  const {lint, test} = await runBuild();
  let x = 0;
  const messages = [
    {
      role: 'system',
      content: 'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
        + '\nyou are busy iterating on coode, you will get multiple attempts to advance the codebase, always perform fixes and or cli commands to advance the project\n'
        + `always check attempts have been made, and the diff history of the attempts carefully for progress, dont repeat the same actions or steps twice, try a alternative approach if it didnt work\n`
        + `Always pay special attention to the attempt summaries, they are the most important part of the task, they are the difference between the current and the previous attempts, used to track progress\n`
        + `if you see that your solution is already listed in attempt summaries and have no alternative solutions, or find multiple <attemptSummary> tags with the same solution, record what failed and why and how it failed in NOTES.txt, and add an <upgradeModel></upgradeModel> tag to the end of your response\n`
        + `Always output your reasoning and any other prose or text in <text></text> tags, as past tense as if the tasks have been completed\n`
        + `Always write files with the following format: <file path="path/to/file.js">...</file>, just the content of the file inside, dont wrap it in any other tags\n`
        + `Always perform CLI commands with the following format: <cli>command</cli>\n`
        + `When the task is complete, output a <complete></complete> tag with a summary of the task in <text> tags\n`
        + `Always obey the rules in the <Rules></Rules> tags\n` 
        + `Only respond using these tags <text></text>, <file></file>, <cli></cli>, and optionally <upgradeModel></upgradeModel>, <complete></complete>.`
        + `never output any other text, prose, formats or tags, all other output has to go into <text></text> tags\n`
        + (cursorRules && cursorRules.length > 0) ? `\n<Rules>\n${cursorRules}\n</Rules>\n` : '' + "\n" +  artifacts.join('\n')
    },          
    {
      "role": "user",
      "content": `<npmVersion>${safeExecSync('npm -v')}</npmVersion>
      <gitStatus>${safeExecSync('git status --short 2>&1 || echo "Not a git repository"')}</gitStatus>
      <gitBranch>${safeExecSync('git branch --show-current 2>&1 || echo "No branch"')}</gitBranch>
      <systemDate>${new Date().toISOString()}</systemDate>
      <workingDirectory>${process.cwd()}</workingDirectory>
      <terminalType>${process.env.TERM || process.platform === 'win32' ? 'cmd/powershell' : 'bash'}</terminalType>
      <bashHistory>${cmdhistory.map(c => c.replace(/<cli>/g, '').replace(/<\/cli>/g, '')).reverse().join('\n')}</bashHistory>
      <diffs>${diffsXML}</diffs>
      <installedDependencies>${safeExecSync('npm ls --depth=0')}</installedDependencies>
      <files>${files}</files>
      <lint>${lint}</lint>
      <test>${test}</test>
      <currentAttempt>${attempts}</currentAttempt>
      <attemptHistory>${summaryBuffer.length > 0 ? `\n${summaryBuffer.filter(s => s.trim() !== '').map((s, i) => `<attemptSummary number="${i}">${s}</attemptSummary>\n`).join('\n')}\n` : ``}</attemptHistory>
      <errors>${errors ? errors : 'no further errors'}</errors>`,
    }, 
    {
      role: 'assistant',
      content:  `<text>artifacts received, I will now begin to work on the task, and only output xml tags, no prose, no other text, no other tags, no other formats, no other output, please provide user instruction and output the <complete></complete> tag when there is no more iterations needed, I wont overwrite any static framework components like ui components that have to stay the same</text>`,
    },
    {
      role: 'user',
      content: `${instruction}`,
    }

  ];
  //debug
  const fs = require('fs');
  const path = require('path');
  const outputFilePath = path.join(__dirname, '../../lastprompt.txt');
  fs.writeFileSync(outputFilePath, messages[0].content+messages[1].content);

  logger.success(`Messages have been written to ${outputFilePath}`);
  logger.debug(`${JSON.stringify(messages).length} B of reasoning input`);
  let retryCount = 0;
  const MAX_RETRIES = 3;
  console.log(cmdhistory)

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

async function main(instruction, errors, model = 'mistral', upgrade = false) {
  console.log('Using model:', model);
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const MAX_ATTEMPTS = 20;
  setCurrentModel(model);

  try {
    if (upgrade) {
      logger.info('Upgrade flag detected, upgrading model...');
      setCurrentModel('deepseek'); // Assuming 'deepseek' is the upgraded model
    }

    if (!instruction || instruction.trim() === '') {
      throw new Error('No instruction provided');
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
    logger.info(`\n\n--------------------------------\n\nUser instruction:\n${instruction}\n\n--------------------------------\n\n`);

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

    let upgradeModelTag = brainstormedTasks.match(/<upgradeModel>/);
    let completeTag = brainstormedTasks.match(/<complete>/);
    

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
        // Remove triple quote pairings from file content if present
        if (!fileMatch || fileMatch.length < 3) continue;

        const filePath = fileMatch[1];
        let fileContent = fileMatch[2];
        // Remove code block markers with optional language specifiers
        fileContent = fileContent.replace(/```(typescript|javascript|css|json|html)/, '')
                                 .replace(/```/, '');
        logger.debug(`Removed code block markers from ${filePath}`);

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

    try {
      let cliFailed = false;
      const executedCommands = new Set();  // Track executed commands
      
      if (cliCommands && cliCommands.length > 0) {
        logger.debug(`Processing ${cliCommands.length} CLI commands`);
        
        for (const cliCommand of cliCommands) {
          const commandMatch = cliCommand.match(/<cli>([\s\S]*?)<\/cli>/);
          if (commandMatch) {
            const command = commandMatch[1].trim();
            
            // --- New Validation Checks ---
            // Check for duplicate commands in this execution batch
            if (executedCommands.has(command)) {
              logger.warn(`Skipping duplicate command in current set: ${command}`);
              continue;
            }
            
            // Validate basic command structure
            if (!/^[\w-]+/.test(command)) {
              logger.error(`Invalid command structure: ${command}`);
              continue;
            }
            // --- End Validation Checks ---

            // Existing skip patterns
            const skipPatterns = [
              /^npm run (start|dev)/,
              /^npm start/,
              /(eslint|lint)/,
              /^npm test/
            ];
            
            if (skipPatterns.some(pattern => pattern.test(command))) {
              logger.warn(`Skipping command: ${command}`);
              continue;
            }

            try {
              logger.debug(`🏁 Executing command: ${command}`);
              const result = await executeCommand(command);
              
              // Store command in execution tracking
              executedCommands.add(command);

              // Keep last 100 commands (was 1000 previously)
              if (cliBuffer.length > 100) {
                cliBuffer.length = 100;
                logger.debug('Trimmed CLI command buffer');
              }

              if (result.code !== 0) {
                cliFailed = true;
                logger.error(`Command failed: ${command}`, result.stderr);
              }
            } catch (error) {
              cliFailed = true;
              logger.error(`Execution error: ${command}`, error.message);
            }
          }
        }
      }

      if (cliFailed) {
        throw new Error('CLI execution failures detected');
      }

      const testResults = await runBuild();

      const lintWarnings = testResults.lint.match(/error: (.*)/g);
      if (lintWarnings && lintWarnings.length > 0) {
        logger.warn('Lint warnings detected:', lintWarnings.join(', '));
        throw new Error('Lint warnings found. Please address them before proceeding.');
      }
      const testWarnings = testResults.lint.match(/Error(.*)/g);
      if (testWarnings && testWarnings.length > 0) {
        logger.warn('Test warnings detected:', testWarnings.join(', '));
        throw new Error('Test warnings found. Please address them before proceeding.');
      }
      if(!completeTag) {
        throw new Error('Task not complete');
      } else if (completeTag) {
        logger.success('Task complete');
        process.exit();
      }
  
      logger.success('Operation successful', cmdhistory);

    } catch (error) {
      logger.error('Failed:', error.message, cmdhistory);
      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        if (summaries && summaries.length > 0) {
          const summaryString = summaries.map(s => s.replace(/<text>/g, '').replace(/<\/text>/g, '')).join('\n');
          summaryBuffer.push(summaryString);
          console.log(summaryString)
        }
        logger.info(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        cmdhistory.length = 0;
        main(process.argv[2], error.message, currentModel, upgrade);
      } else {
        throw new Error('Max attempts reached');
      }
    }

    logger.debug('Final directory contents:', fs.readdirSync(process.cwd()));
    logger.success('Operation successful');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Parse command line arguments
program
  .argument('[instruction]', 'Instruction to execute')
  .option('-m, --model <type>', 'Model to use (mistral/groq)', 'mistral')
  .option('--upgrade', 'Upgrade the model on the first pass')
  .action((instruction, options) => {
    currentModel = options.model;
    main(instruction, null, currentModel, options.upgrade).catch((error) => {
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
