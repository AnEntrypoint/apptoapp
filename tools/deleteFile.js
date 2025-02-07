const fs = require('fs').promises;

/**
 * @tool deleteFile
 * @description Delete a file
 * @param {string} path - Path to the file to delete
 * @returns {Promise<string>} Confirmation message
 */
async function deleteFile(path) {
    console.log(path)
    console.log('Deleting file: %s', path);
    await fs.unlink(path);
    return `File deleted: ${path}`;
}

module.exports = deleteFile; 