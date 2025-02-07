const fs = require('fs').promises;

/**
 * @tool createFolder
 * @description Create a new folder
 * @param {string} path - Path to the folder to create
 * @returns {Promise<string>} Confirmation message
 */
async function createFolder(path) {
    console.log('Creating folder: %s', path);
    await fs.mkdir(path, { recursive: true });
    return `Folder created: ${path}`;
}

module.exports = createFolder; 