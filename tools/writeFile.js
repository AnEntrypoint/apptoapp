const fs = require('fs').promises;
const path = require('path');
const { cmdhistory } = require('../utils');

/**
 * @tool writeFile
 * @description Write content to a file
 * @param {string} filePath - Path to the file (required)
 * @param {string} content - Content to write to the file
 * @returns {Promise<string>} Confirmation message
 */
async function writeFile(filePath, content) {
    if (!filePath) {
        throw new Error('Path is required');
    }

    console.log('Writing file at path:', filePath);
    cmdhistory.push(`Writing file at path: ${filePath}`); // Log to cmdhistory

    // Ensure the directory exists recursively
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf8'); // Using fs to write the file
    console.log(`File written successfully at: ${filePath}`);
    cmdhistory.push(`File written successfully at: ${filePath}`); // Log to cmdhistory
    return `File written: ${filePath}`;
}

module.exports = writeFile; 