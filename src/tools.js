const { exec } = require('child_process');

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
