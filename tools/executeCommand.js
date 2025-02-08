const { executeCommand: runCmd } = require('../utils');

/**
 * @tool executeCommand
 * @description Execute a CLI command
 * @param {string} command - Command to execute
 * @returns {Promise<string>} Command output
 */
async function executeCommand(command) {
    if (!command) throw new Error('Command is required');
    console.log('Executing command:', command);
    const { stdout, stderr } = await runCmd(command);
    return `Command executed: ${command}\nOutput: ${stdout}${stderr}`;
}
 
module.exports = executeCommand; 