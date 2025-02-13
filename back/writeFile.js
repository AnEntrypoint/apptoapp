const { exec } = require('child_process');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

async function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      timeout: 5000,
      ...options
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim() + '\n');  // Trim and add single newline
    });
  });
}

async function writeFile(filePath, content) {
  try {
    // Ensure the directory exists
    const dir = path.dirname(filePath);

    // Check if the directory exists and is writable
    try {
      await fsp.access(dir, fs.constants.F_OK | fs.constants.W_OK);
    } catch (accessError) {
      // Explicitly throw an error if the directory does not exist or is not writable
      throw new Error(`Cannot write to path: ${filePath}`);
    }

    // Write the file
    await fsp.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    // Explicitly handle different error cases
    if (error.code === 'ENOENT') {
      throw new Error(`Cannot write to path: ${filePath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`);
    }
    throw error;
  }
}

module.exports = writeFile;