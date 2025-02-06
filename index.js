const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { generatePlan, writeFilesFromStr, cycleTasks } = require('./transform');

async function main() {
  const testUrl = 'http://localhost:3000'; // Replace with your actual test URL
  const instruction = 'make this a comprehensive artist portfolio site'; // Replace with your actual instruction

  // Ensure the user is in the ./test directory
  if (process.cwd() !== path.resolve(__dirname, 'test')) {
    console.error('Please run this script from the ./test directory');
    process.exit(1);
  }

  // Generate plan based on instruction
  const plan = await generatePlan(instruction);
  console.log('Generated Plan:', plan);

  // Write files from plan
  await writeFilesFromStr(plan);

  // Start the cycle
  await cycleTasks(testUrl, instruction);
}

main().catch(console.error);
