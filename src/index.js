const dotenv = require('dotenv');
const { getFiles } = require('./files.js');
const { loadIgnorePatterns, makeApiRequest, loadCursorRules } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');

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
      throw new Error(`Build failed: ${stderr || stdout}`);
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
          resolve('Test timed out');
        }).catch(reject);
      }, timeoutDuration);
    }

    testProcess.then((result) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (result.code !== 0) {
        if (process.env.NODE_ENV === 'test') {
          resolve(`Test failed with code ${result.code}`);
        } else {
          console.error('Build failed with exit code:', result.code);
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

async function main(instruction, previousLogs) {
  const MAX_RETRIES = 3;
  const MAX_ATTEMPTS = 3;
  let attempts = 0;

  try {
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
        cmdhistory.push(newcmdhistory);
      }
      const messages = [
        {
          role: 'system',
          content: `${'You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction\n'
            + 'avoid editing the frameworks configuration files or any settings file when possible\n'
            + 'always discover and solve all solutions by writing unit tests\n'
            + 'fix as many linting errors as possible, the backend will run npm run test automatically which lints the codebase\n'
            + 'add as many files as are needed to complete the instruction\n'
            + 'always ensure you\'re writing the files in the correct place, never put them in the wrong folder\n'
            + 'pay careful attention to the logs, make sure you dont try the same thing twice and get stuck in a loop\n'
            + 'only mention files that were edited, dont output unchanged files\n'
            + 'If installing new packages using the cli, use --save or --save-dev to preserve the changes\n'
            + 'never remove dependencies from package.json, unless theres evidence its no longer needed\n'
            + 'IMPORTANT: Only output file changes in xml format like this: <file path="path/to/edited/file.js">...</file> and cli commands in this schema <cli>command here</cli>\n'
            + 'ULTRA IMPORTANT: dont include any unneccesary steps, only include instructions that are needed to complete the user instruction\n'
            + 'ULTRA IMPORTANT: only make changes if they\'re neccesary, if a file can stay the same, exclude it from your output\n'
            + 'ULTRA IMPORTANT: make sure you dont regress any parts of any file, features, depedencies and settings need to remain if they\'re used in the codebase\n'
            + 'ULTRA IMPORTANT: only output complete files, no partial changes to files\n'
            + 'ULTRA IMPORTANT: be careful to preserve all the existing functionality that the codebase still needs, especially package.json, edit it only if needed\n\n'
            + 'ULTRA IMPORTANT: if a library is referenced anywhere in the code, do not produce a package.json that excludes it.'}${
            cmdhistory.length > 0 ? `Logs: (fix the errors in the logs if needed)\n<logs>${cmdhistory.join('\n')}</logs>\n\n` : ''
          }${(previousLogs && previousLogs.length) > 0 ? `Previous Logs: (fix the errors in the logs if needed)\n<logs>${previousLogs}</logs>\n\n` : ''
          }Files:\n${files}`,
        },
        {
          role: 'user',
          content: `${instruction}\n\nRules:\n${cursorRules}`,
        },
      ];
      console.log(`${JSON.stringify(messages).length} B of reasoning input`);
      let retryCount = 0;
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
    console.log(`${JSON.stringify(brainstormedTasks).length} B of reasoning output`);

    const filesToEdit = brainstormedTasks.match(/<file path="([^"]+)">(.*?)<\/file>/g);
    const cliCommands = brainstormedTasks.match(/<cli>(.*?)<\/cli>/g);

    console.log({ filesToEdit, cliCommands });

    if (filesToEdit && filesToEdit.length > 0) {
      for (const file of filesToEdit) {
        const filePath = file.match(/<file path="([^"]+)">/)[1];
        const fileContent = file.match(/>(.*?)<\/file>/)[1];
        console.log({ filePath, fileContent });
      }
    }

    if (cliCommands && cliCommands.length > 0) {
      for (const cliCommand of cliCommands) {
        const command = cliCommand.match(/<cli>(.*?)<\/cli>/)[1];
        console.log({ command });
        await executeCommand(command); // Execute the command using the executeCommand tool
      }
    }

    try {
      await runBuild();
    } catch (error) {
      console.error('Build failed:', error);
      if (attempts < MAX_ATTEMPTS) {
        attempts++;
        console.log(`Retrying main function (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await main(instruction, error.message);
      } else {
        throw new Error('Max attempts reached');
      }
    }
  } catch (error) {
    console.error('Application error:', error);
    process.exit(1);
  }
}

const instruction = process.argv[2];
main(instruction).catch((error) => {
  console.error('Application error:', error);
  process.exit(0);
});

module.exports = {
  main,
};
