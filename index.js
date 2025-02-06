#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { runDevAndPupdebug } = require('./src/testing/devRunner');
const { updateUnitTests, runUnitTests } = require('./src/testing/unitTests');
const { readTodo, removeTask, appendChangelog } = require('./src/operations/fileOps');
const { executeOperation, determineTaskCompletion } = require('./src/operations/taskOps');
const { needsDecomposition, decomposeTask } = require('./src/operations/taskDecomposition');
const { generatePlan, writeFilesFromStr, cycleTasks } = require('./src/operations/main');
const sleep = require('./src/utils/sleep');
const { execCliCommand } = require('./src/utils/cli');

async function main() {
  try {
    logger.info('Starting application transformation process');
    const testUrl = config.testing.baseUrl;
    const instruction = process.argv[2] || 'make this a comprehensive artist portfolio site';

    // Ensure the user is in the ./test directory
    if (process.cwd() !== path.resolve(__dirname, 'test')) {
      logger.error('Invalid working directory', { 
        expected: path.resolve(__dirname, 'test'),
        actual: process.cwd()
      });
      process.exit(1);
    }

    // Generate plan based on instruction
    logger.info('Generating plan', { instruction });
    const plan = await generatePlan(instruction);
    logger.debug('Generated plan', { plan });

    // Write files from plan
    logger.info('Writing files from plan');
    await writeFilesFromStr(plan);

    // Start cyclic task evaluation
    logger.info('Starting cyclic task evaluation', { testUrl });
    await cycleTasks(testUrl, instruction);
  } catch (error) {
    logger.error('Application failed', { 
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

async function cleanup() {
  logger.info('Starting cleanup process');
  try {
    // Stop the dev server if it's running
    await new Promise((resolve, reject) => {
      exec('taskkill /F /IM node.exe', (error, stdout, stderr) => {
        if (error && !error.message.includes('not found')) {
          logger.error('Error stopping dev server', { error: error.message });
          reject(error);
          return;
        }
        if (stderr) {
          logger.warn('Cleanup stderr output', { stderr });
        }
        if (stdout) {
          logger.debug('Cleanup stdout output', { stdout });
        }
        resolve();
      });
    });

    // Collect logs
    if (fs.existsSync('lastCycleLogs.txt')) {
      const logs = fs.readFileSync('lastCycleLogs.txt', 'utf8');
      logger.info('Collected cycle logs', { logs });
    } else {
      logger.warn('No cycle logs found to collect');
    }
  } catch (error) {
    logger.error('Cleanup process failed', { 
      error: error.message,
      stack: error.stack
    });
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal');
  await cleanup();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

main().catch(error => {
  logger.error('Fatal error in main process', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
