const fs = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, scanDirectory } = require('./utils');
const { diffLines } = require('diff');

async function readDirRecursive(dir, ig) {
  console.log(`Reading directory recursively: ${dir}`);
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => {
    console.log(`[DEBUG] Processing path: ${relativePath}`);
    return { path: fullPath };
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
      }
    }
  }));

  console.log(`Finished reading directory: ${dir}, found ${result.length} files`);
  console.log(`Total files collected: ${result.length}`); // Added output for total files collected
  return result;
}

async function createDiff(preferredDir) {
  const sourceDir = preferredDir || process.cwd();
  console.log(`Creating diff for source directory: ${sourceDir}`);
  
  if (!sourceDir) {
    console.log('No source directory found');
    throw new Error('Neither /app nor /src directory found');
  }
  
  const ig = await loadIgnorePatterns();
  console.log('Loaded ignore patterns');
  
  const files = await readDirRecursive(sourceDir, ig);
  console.log(`Total files to process: ${files.length}`);
  
  let diffOutput = '';
  const noContents = []; // List to store file names without contents
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file.path).replace(/\\/g, '/');
      console.log(`Processing file: ${file.path}, source-relative path: ${relativePath}`);
      
      if (ig.ignores(relativePath)) {
        noContents.push(relativePath); // Add to noContents if ignored
        console.log(`Ignoring file: ${relativePath}`);
        continue; // Skip processing this file
      }
      
      const originalContent = await fs.readFile(file.path, 'utf8');
      const modifiedContent = ''; // Modify content as needed

      console.log('Including content for file:', file.path);
      const diff = diffLines(originalContent, modifiedContent);
      diffOutput += `diff --git a/${relativePath} b/${relativePath}\n`;
      diffOutput += `--- a/${relativePath}\n`;
      diffOutput += `+++ b/${relativePath}\n`;
      diff.forEach(part => {
        const prefix = part.added ? '+' : part.removed ? '-' : ' ';
        diffOutput += `${prefix}${part.value}`;
      });
      
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const diffSize = Buffer.byteLength(diffOutput, 'utf8');
  console.log(`Generated diff size: ${diffSize} bytes`);
  
  console.log('Files ignored (no contents):', noContents);
  
  return diffOutput || `No files found in ${sourceDir} directory`;
}

(async () => {
  console.log('Starting diff creation...');
  const diff = await createDiff();
  console.log('Diff creation completed:', diff);
})();

module.exports = { createDiff };