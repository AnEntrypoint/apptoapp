const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runDevAndPupdebug } = require('./testing/devRunner');
const { updateUnitTests, runUnitTests } = require('./testing/unitTests');
const { readTodo, removeTask, appendChangelog } = require('./operations/fileOps');
const { executeOperation, determineTaskCompletion } = require('./operations/taskOps');
const { needsDecomposition, decomposeTask } = require('./operations/taskDecomposition');
const { generatePlan, writeFilesFromStr, cycleTasks } = require('./operations/main');
const sleep = require('./utils/sleep');

async function main() {
  const testUrl = 'http://localhost:3000'; // Replace with your actual test URL
  const instruction = 'make this a comprehensive artist portfolio site'; // Replace with your actual instruction

  // Generate plan based on instruction
  const plan = await generatePlan(instruction);
  console.log('Generated Plan:', plan);

  // Write files from plan
  await writeFilesFromStr(plan);

  // Start cyclic task evaluation
  await cycleTasks(testUrl, instruction);
}

async function cleanup() {
  console.log('Cleaning up...');
  // Stop the dev server if it's running
  exec('taskkill /F /IM node.exe', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error stopping dev server: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });

  // Collect logs
  if (fs.existsSync('lastCycleLogs.txt')) {
    const logs = fs.readFileSync('lastCycleLogs.txt', 'utf8');
    console.log('Collected logs:', logs);
  } else {
    console.log('No logs found to collect.');
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

main().catch(console.error);