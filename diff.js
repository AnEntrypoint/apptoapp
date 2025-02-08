const fs = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');

async function readDirRecursive(dir, ig) {
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => {
    return { path: path.resolve(fullPath) }; // Use absolute path
  });
  
  // Output empty folders as their paths
  const emptyFolders = await fs.readdir(dir);
  await Promise.all(emptyFolders.map(async (folder) => {
    const fullPath = path.join(dir, folder);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      const filesInFolder = await fs.readdir(fullPath);
      if (filesInFolder.length === 0) {
        console.log(`Found empty folder: ${fullPath}`);
        result.push({ path: path.resolve(fullPath) + '/' }); // Add empty folder to result with trailing slash
      }
    }
  }));
  return result;
}

async function createDiff(preferredDir) {
  const sourceDir = preferredDir || process.cwd();
  
  if (!sourceDir) {
    console.log('No source directory found');
    throw new Error('Neither /app nor /src directory found');
  }
  
  const ig = await loadIgnorePatterns();
  const noc = await loadNoContentsPatterns(); // Load no contents patterns
  
  const files = await readDirRecursive(sourceDir, ig);
  console.log(`Total files to process: ${files.length}`);
  
  let textOutput = '';
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file.path).replace(/\\/g, '/');
      
      // Check if the current file path is a directory.
      let fileStats;
      try {
        fileStats = await fs.stat(file.path);
      } catch (statError) {
        console.error(`Error getting stats for ${file.path}:`, statError);
        continue;
      }
      if (fileStats.isDirectory()) {
        continue; // Skip directories
      }
      
      // Skip files that match the ignore patterns
      if (ig.ignores(relativePath)) {
        continue;
      }
      
      // If file is marked to have no contents, output just its path
      if (noc.ignores(relativePath)) {
        textOutput += `${relativePath}\n\n`;
        continue;
      }
      
      let originalContent = '';
      try {
        originalContent = await fs.readFile(file.path, 'utf8');
      } catch (error) {
        console.log(`Error reading file ${file.path}:`, error);
        continue;
      }
      
      // Write file path and its content, separated clearly by dividers
      textOutput += `File: ${relativePath}\n`;
      textOutput += '-----------------------------\n';
      textOutput += originalContent;
      textOutput += '\n-----------------------------\n\n';
      
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const outputSize = Buffer.byteLength(textOutput, 'utf8');
  console.log(`Generated text output size: ${outputSize} bytes`);
  
  return textOutput || `No files found in ${sourceDir} directory`;
}

module.exports = { createDiff };