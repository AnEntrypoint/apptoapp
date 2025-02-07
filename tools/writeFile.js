const { executeCommand: runCmd } = require('../utils');

/**
 * @tool writeFile
 * @description Write content to a file
 * @param {string} path - Path to the file (required)
 * @param {string} content - Content to write to the file
 * @returns {Promise<string>} Confirmation message
 */
async function writeFile(path, content) {
    if (!path) {
        throw new Error('Path is required');
    }

    console.log('Writing file at path:', path);
    await runCmd(`echo "${content}" > ${path}`); // Using executeCommand to write the file
    return `File written: ${path}`;
}

module.exports = writeFile; 