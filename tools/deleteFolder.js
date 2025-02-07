const fs = require('fs').promises;

/**
 * @tool deleteFolder
 * @description Delete a folder and all its contents
 * @param {string} path - Path to the folder to delete
 * @returns {Promise<string>} Confirmation message
 */
async function deleteFolder(path) {
    console.log('Deleting folder: %s', path);
    await fs.rm(path, { recursive: true, force: true });
    return `Folder deleted: ${path}`;
}

module.exports = deleteFolder; 