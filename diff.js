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
  
  let diffOutput = '';
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file.path).replace(/\\/g, '/');
      
      // Check if the current file path is actually a directory.
      let fileStats;
      try {
        fileStats = await fs.stat(file.path);
      } catch (statError) {
        console.error(`Error getting stats for ${file.path}:`, statError);
        continue;
      }
      if (fileStats.isDirectory()) {
        //console.log(`Skipping directory: ${file.path}`);
        continue; // Skip directories to avoid EISDIR error
      }
      
      if (ig.ignores(relativePath) || noc.ignores(relativePath)) { // Check against both ignore and no contents
        //console.log(`Ignoring file: ${relativePath}`);
        continue; // Skip processing this file
      }
      
      let originalContent = '';
      try {
        originalContent = await fs.readFile(file.path, 'utf8'); // Read original content
      } catch (error) {
        console.log(`Error reading file ${file.path}:`, error);
        continue; // Skip to the next file if there's an error
      }

      // Include file path and content for diff output
      if (noc.ignores(relativePath)) {
        diffOutput += `${relativePath}\n`; // Just the relative path for no contents files
      } else {
        const originalLines = originalContent.split('\n');
        
        originalLines.forEach((line) => {
          diffOutput += `+ ${line.trim()}\n`; // Add all lines as additions
        });
        
        diffOutput += `\n+++ ${relativePath}\n`; // Add file path to the diff output with a newline before
      }
      
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const diffSize = Buffer.byteLength(diffOutput, 'utf8');
  console.log(`Generated diff size: ${diffSize} bytes`);
  
  return diffOutput || `No files found in ${sourceDir} directory`;
}

module.exports = { createDiff };