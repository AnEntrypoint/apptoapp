const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');
 
async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error && error.code !== 0) {
        reject(error);
      } else {
        resolve({ stdout, stderr, code: error ? error.code : 0 });
      }
    });
  });
}


module.exports = {
  executeCommand
};
