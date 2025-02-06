const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readFile, writeFile, appendFile, deleteFile, createDirectory, deleteDirectory, move, copy } = require('./fileOps');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

/**
 * Generates a plan based on the given instruction.
 * @param {string} instruction - The instruction to generate the plan for.
 * @returns {string} The generated plan.
 */
async function generatePlan(instruction) {
  logger.info("Generating plan based on instruction:", instruction);
  logger.info("Analyzing existing codebase structure...");

  // Ensure the project structure exists
  if (!await ensureProjectStructure()) {
    throw new Error('Failed to set up project structure');
  }

  const plan = [
    // Add tasks based on the instruction
  ];

  return plan.join('\n');
}

/**
 * Writes files from the given text.
 * @param {string} text - The text containing the files to write.
 */
async function writeFilesFromStr(text) {
  try {
    writeFile('TODO.txt', text);
    logger.info(`Wrote plan to TODO.txt file.`);
  } catch (error) {
    logger.error("Error writing plan:", error);
    throw error;
  }
}

/**
 * Starts cyclic task evaluation.
 * @param {string} testUrl - The URL to test.
 * @param {string} instruction - The instruction to follow.
 * @param {number} [pollInterval=30000] - The interval to poll for new tasks.
 */
async function cycleTasks(testUrl, instruction, pollInterval = 30000) {
  if (!fs.existsSync('TODO.txt')) writeFile('TODO.txt', '');
  if (!fs.existsSync('CHANGELOG.txt')) writeFile('CHANGELOG.txt', '');

  logger.info('\nStarting cyclic task evaluation...');
  while (true) {
    try {
      const tasks = readTodo();
      if (tasks.length === 0) {
        logger.info('\nNo tasks in TODO.txt. Adding summary to CHANGELOG.txt...');
        appendChangelog('Summary', 'No tasks in TODO.txt');
        break;
      }

      for (const task of tasks) {
        await executeOperation(task);
        removeTask(task);
        appendChangelog(task, 'Task completed');
      }

      await sleep(pollInterval);
    } catch (error) {
      logger.error('Error in cyclic task evaluation', { error: error.message });
      await sleep(pollInterval);
    }
  }
}

/**
 * Reads the TODO.txt file and returns the tasks.
 * @returns {string[]} The tasks in the TODO.txt file.
 */
function readTodo() {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = readFile('TODO.txt');
      return data.split('\n').map(line => line.trim()).filter(line => line !== '');
    }
    return [];
  } catch (error) {
    logger.error('Error reading TODO.txt:', error);
    return [];
  }
}

/**
 * Removes a task from the TODO.txt file.
 * @param {string} task - The task to remove.
 */
function removeTask(task) {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = readFile('TODO.txt');
      const updatedData = data.split('\n').filter(line => line.trim() !== task).join('\n');
      writeFile('TODO.txt', updatedData);
      logger.info(`Removed task: ${task}`);
    }
  } catch (error) {
    logger.error('Error removing task:', error);
  }
}

/**
 * Appends a task to the CHANGELOG.txt file.
 * @param {string} task - The task to append.
 * @param {string} message - The message to append.
 */
function appendChangelog(task, message) {
  try {
    const logEntry = `${new Date().toISOString()} - ${message} - Task: ${task}\n`;
    appendFile('CHANGELOG.txt', logEntry);
    logger.info(`Appended to CHANGELOG.txt: ${logEntry.trim()}`);
  } catch (error) {
    logger.error('Error appending to CHANGELOG.txt:', error);
  }
}

/**
 * Ensures the project structure exists.
 * @returns {boolean} True if the project structure exists, false otherwise.
 */
async function ensureProjectStructure() {
  const baseDir = 'test';

  try {
    // Create base directories
    const dirs = [
      '',
      'app',
      'components',
      'public',
      'test',
      'test/__tests__',
      'test/app',
      'test/components',
      'test/test',
      'test/test/__tests__',
      'test/test/app',
      'test/test/components',
    ];

    dirs.forEach(dir => {
      const dirPath = path.join(baseDir, dir);
      if (!fs.existsSync(dirPath)) {
        createDirectory(dirPath);
      }
    });

    return true;
  } catch (error) {
    logger.error('Error ensuring project structure:', error);
    return false;
  }
}

/**
 * Executes an operation based on the given task.
 * @param {string} task - The task to execute.
 */
async function executeOperation(task) {
  logger.info(`Starting operation: ${task}`);
  const baseDir = 'test';

  try {
    // Project Setup tasks
    if (task.includes('Initialize Next.js project structure')) {
      const nextConfigPath = path.join(baseDir, 'next.config.js');
      ensureDirectoryExists(nextConfigPath);
      writeFile(nextConfigPath, `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['example.com'],
  },
};
`);
    }

    // Add more tasks as needed

  } catch (error) {
    logger.error(`Error executing operation: ${task}`, { error: error.message });
  }
}

/**
 * Ensures a directory exists.
 * @param {string} filePath - The path to the file.
 */
function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    createDirectory(dirname);
  }
}

/**
 * Sleeps for the given number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  generatePlan,
  writeFilesFromStr,
  cycleTasks,
  readTodo,
  removeTask,
  appendChangelog,
  ensureProjectStructure,
  executeOperation,
  ensureDirectoryExists,
  sleep,
};
