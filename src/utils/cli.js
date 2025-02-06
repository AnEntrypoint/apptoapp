const { exec, spawn } = require('child_process');

function truncateLog(log, maxLength = 200) {
  if (log.length > maxLength) {
    return log.substring(0, maxLength) + '... (truncated)';
  }
  return log;
}

function execCliCommand(command) {
  console.log(`Executing CLI command: ${command}`);
  return new Promise((resolve, reject) => {
    exec(command, { shell: 'powershell.exe' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${command}`, error);
        return reject(error);
      }
      const output = stdout.trim();
      resolve(truncateLog(output));
    });
  });
}

function askQuestion(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

module.exports = { execCliCommand, askQuestion, truncateLog };
