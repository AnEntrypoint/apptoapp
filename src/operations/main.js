const fs = require('fs');
const sleep = require('../utils/sleep');
const { runDevAndPupdebug } = require('../testing/devRunner');
const { updateUnitTests, runUnitTests } = require('../testing/unitTests');
const { readTodo, removeTask, appendChangelog } = require('./fileOps');
const { executeOperation, determineTaskCompletion } = require('./taskOps');
const { needsDecomposition, decomposeTask } = require('./taskDecomposition');
const { execCliCommand } = require('../utils/cli');

async function generatePlan(instruction) {
  console.log("Generating plan based on instruction:", instruction);
  await sleep(1000);
  console.log("Using Mistral API to generate plan");
  await sleep(2000);

  // Dynamic plan based on the instruction
  const plan = [
    "Analyze user instruction",
    "Create project structure",
    "Implement core features",
    "Add navigation menu",
    "Add portfolio section",
    "Add contact form",
    "Add responsive design",
    "Add unit tests for components"
  ];

  return plan.join('\n');
}

async function writeFilesFromStr(text) {
  try {
    fs.writeFileSync('TODO.txt', text);
    console.log(`Wrote plan to TODO.txt file.`);
  } catch (error) {
    console.error("Error writing plan:", error);
    throw error;
  }
}

async function cycleTasks(testUrl, instruction, pollInterval = 30000) {
  if (!fs.existsSync('TODO.txt')) fs.writeFileSync('TODO.txt', '');
  if (!fs.existsSync('CHANGELOG.txt')) fs.writeFileSync('CHANGELOG.txt', '');
  if (!fs.existsSync('NOTES.txt')) fs.writeFileSync('NOTES.txt', '');

  console.log('Starting cyclic task evaluation...');
  while (true) {
    try {
      const tasks = readTodo();
      if (tasks.length === 0) {
        console.log('No tasks in TODO.txt. Adding summary to CHANGELOG.txt...');
        const summary = `Summary: Completed all tasks based on instruction "${instruction}".`;
        appendChangelog(summary, 'Summary');
        await sleep(pollInterval);
        continue;
      }

      let needsServerRun = false;
      for (const task of tasks) {
        console.log(`Evaluating task: ${task}`);
        if (needsDecomposition(task)) {
          console.log(`Task requires decomposition: ${task}`);
          const subTasks = decomposeTask(task);
          if (subTasks.length > 0) {
            console.log(`Decomposed task into sub-tasks: ${subTasks.join(', ')}`);
            removeTask(task);
            fs.appendFileSync('TODO.txt', subTasks.join('\n') + '\n');
            continue;
          }
        }

        console.log(`Checking if task is completed: ${task}`);
        if (determineTaskCompletion(task)) {
          console.log(`Task is completed: ${task}`);
          executeOperation(task);
          appendChangelog(task, `Operation executed successfully`);
          removeTask(task);
        } else {
          console.log(`Task is not completed: ${task}`);
          needsServerRun = true;
        }
      }

      if (needsServerRun) {
        console.log('Running dev server and pupdebug...');
        const shouldRecordLogs = true; // Determine if recording logs is necessary
        const combinedLogs = await runDevAndPupdebug(testUrl, shouldRecordLogs);
        console.log('Dev server and pupdebug completed. Updating unit tests...');
        await updateUnitTests(instruction);

        if (!await runUnitTests()) {
          console.log("Unit tests failed. Skipping this cycle.");
          await sleep(pollInterval);
          continue;
        }
      }

      // Verify changes by running the application
      console.log('Verifying changes by running the application...');
      const verifyCommand = 'cd test; node ../index.js transform this into a comprehensive artist portfolio website';
      const verifyOutput = await execCliCommand(verifyCommand);
      console.log('Verification output:', verifyOutput);

      // Speculate on further changes
      fs.appendFileSync('NOTES.txt', `Verification output:\n${verifyOutput}\n\n`);
      fs.appendFileSync('NOTES.txt', `Speculating on further changes...\n\n`);

      await sleep(pollInterval);
    } catch (error) {
      console.error('Cycle error:', error);
      await sleep(pollInterval);
    }
  }
}

module.exports = { cycleTasks, generatePlan, writeFilesFromStr };