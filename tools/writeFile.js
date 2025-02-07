const fs = require('fs').promises;

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
    await fs.writeFile(path, content, 'utf8'); // Using fs to write the file
    console.log(`File written successfully at: ${path}`);
    return `File written: ${path}`;
}

module.exports = writeFile; 