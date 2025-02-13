const { getFiles } = require('./files.js');
const { getTools, executeToolCall } = require('./tools.js');
const dotenv = require('dotenv');
const fsp = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, makeApiRequest, loadCursorRules } = require('./utils');
const { executeCommand, cmdhistory } = require('./utils');

dotenv.config();

async function runBuild() {
  let result, code, stdout, stderr;

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
  let logBuffer = [];

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
        testProcess.then(result => {
          result.kill();
          resolve('Test timed out');
        }).catch(reject);
      }, timeoutDuration);
    }

    testProcess.then(result => {
      if (timeoutId) clearTimeout(timeoutId);
      if (result.code !== 0) {
        if (process.env.NODE_ENV === 'test') {
          resolve(`Test failed with code ${result.code}`);
        } else {
          console.error('Build failed with exit code:', result.code);
          console.error('STDOUT:', result.stdout);
          console.error('STDERR:', result.stderr);
          reject(new Error(`Build failed: ${result.stderr || result.stdout}`));
        }
      } else {
        resolve(`Build exit code: ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
      }
    }).catch(error => {
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

      const messages = [
        {
          'role': 'system',
          'content': `You are a senior programmer with over 20 years of experience, you make expert and mature software development choices, your main goal is to complete the user instruction`+
          `avoid editing the frameworks configuration files or any settings file when possible\n`+
          `always discover and solve all solutions by writing unit tests`+
          `focus on one issue at a time, the backend will rerun this part to allow you to make more changes down the line\n`+
          `add as many files as are needed to complete the instruction\n`+
          `always ensure you're writing the files in the correct place, never put them in the wrong folder\n`+
          `pay careful attention to the logs, make sure you dont try the same thing twice and get stuck in a loop\n`+
          `only mention files that were edited, dont output unchanged files\n`+
          `If installing new packages use --save or --save-dev to preserve the changes\n`+
          `never remove dependencies from package.json, unless theres evidence its no longer needed\n`+
          `Only output file changes in xml format with this schema: <file path="path/to/file.js">...</file> and cli commands in this schema <cli>ls -l</cli>`+
          `ULTRA IMPORTANT: dont include any unneccesary steps, only include instructions that are needed to complete the user instruction`+
          `ULTRA IMPORTANT: only make changes if they're neccesary, if a file can stay the same, exclude it from your output`+
          `ULTRA IMPORTANT: make sure you dont regress any parts of any file, features, depedencies and settings need to remain if they're used in the codebase\n`+
          `ULTRA IMPORTANT: only output complete files, no partial changes to files\n`+
          `ULTRA IMPORTANT: be careful to preserve all the existing functionality that the codebase still needs, especially package.json, edit it only if needed\n\n`+
          `ULTRA IMPORTANT: if a library is referenced anywhere in the code, do not produce a package.json that excludes it.`+
          `${cmdhistory.length > 0 ? 'Logs: (fix the errors in the logs if needed)\n<logs>'+cmdhistory.join('\n')+'</logs>\n\n' : ''}`+
          `${(previousLogs && previousLogs.length) > 0 ? 'Previous Logs: (fix the errors in the logs if needed)\n<logs>' + previousLogs + '</logs>\n\n' : ''}`+
          `Files:\n${files}`
        },
        {
          role: 'user',
          content: instruction+`\n\nRules:\n${cursorRules}`
        }
      ];
      console.log(JSON.stringify(messages).length+' B of reasonsing input');
      let retryCount = 0;
      while (retryCount < MAX_RETRIES) {
        try {
          const response = await makeApiRequest(
            messages,
            [],
            process.env.MISTRAL_API_KEY,
            'https://codestral.mistral.ai/v1/chat/completions'
          );

          return response.choices[0].message.content;
        } catch (error) {
          console.error(`API request failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
          retryCount++;
          if (retryCount >= MAX_RETRIES) {
            throw error;
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      return [];
    }

    const brainstormedTasks = await brainstormTaskWithLLM(instruction);
    console.log(JSON.stringify(brainstormedTasks).length+' B of reasoning output');

    const filesToEdit = brainstormedTasks.match(/<file path="([^"]+)">(.*?)<\/file>/g);
    const cliCommands = brainstormedTasks.match(/<cli>(.*?)<\/cli>/g);

    console.log({filesToEdit, cliCommands});

    if(filesToEdit && filesToEdit.length > 0) {
    for (const file of filesToEdit) {
      const filePath = file.match(/<file path="([^"]+)">/)[1];
      const fileContent = file.match(/>(.*?)<\/file>/)[1];
      console.log({filePath, fileContent});
      }
    } 

    if(cliCommands && cliCommands.length > 0) {
      for (const cliCommand of cliCommands) {
      const command = cliCommand.match(/<cli>(.*?)<\/cli>/)[1];
      console.log({command});
      await executeCommand(command); // Execute the command using the executeCommand tool
      }
    }

    /*const messages = [
      {
        role: 'system',
        content: `Respond only in multiple tool calls to write all the files in the user prompt\n\nULTRA IMPORTANT: only output complete files, no partial changes to files\n\nfollow that with any cli commands to run, and finally call the explanation tool to report to the user.\n\n`
      },
      {
        role: 'user',
        content: brainstormedTasks
      }
    ];
    console.log(JSON.stringify(messages).length+' B of tool call message input');
    let retryCount = 0;
    while (retryCount < MAX_RETRIES) {
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
              console.error('Tool call failed:', error);
              throw error; // Let the outer try-catch handle retries
            }
          }
        }
        break; // Success, exit the loop
      } catch (error) {
        console.error(`Transformation failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          throw error;
        }
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }*/

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
main(instruction).catch(error => {
  console.error('Application error:', error);
  process.exit(0);
});

module.exports = {
  main
};
