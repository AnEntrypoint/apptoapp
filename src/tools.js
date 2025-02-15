const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
 
async function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      timeout: 5000,
      ...options, 
    }, (error, stdout, stderr) => {
      if (error) {
        reject(stdout||stderr);
        return;
      }
      resolve(`${stdout.trim()}\n`); // Trim and add single newline
    });
  });
}


module.exports = {
  executeCommand
};
