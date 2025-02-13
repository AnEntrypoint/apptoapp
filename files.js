const fs = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');

async function readDirRecursive(dir, ig) {
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => {
    return { path: path.resolve(fullPath) };
  });
  
  const emptyFolders = await fs.readdir(dir);
  await Promise.all(emptyFolders.map(async (folder) => {
    const fullPath = path.join(dir, folder);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      const filesInFolder = await fs.readdir(fullPath);
      if (filesInFolder.length === 0) {
        console.log(`Found empty folder: ${fullPath}`);
        result.push({ path: path.resolve(fullPath) + '/' });
      }
    }
  }));
  return result;
}

async function getFiles(preferredDir) {
  const sourceDir = preferredDir || process.cwd();
  
  if (!sourceDir) {
    console.log('No source directory found');
    throw new Error('Neither /app nor /src directory found');
  }
  
  const ig = await loadIgnorePatterns();
  const noc = await loadNoContentsPatterns();
  
  const files = await readDirRecursive(sourceDir, ig);
  console.log(`Total files to process: ${files.length}`);
  
  let textOutput = '';
  let fileCount = 0;
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file.path).replace(/\\/g, '/');
      
      let fileStats;
      try {
        fileStats = await fs.stat(file.path);
      } catch (statError) {
        console.error(`Error getting stats for ${file.path}:`, statError);
        continue;
      }
      if (fileStats.isDirectory()) {
        continue;
      }
      
      if (ig.ignores(relativePath) || noc.ignores(relativePath)) {
        console.log(`Ignoring file/folder: ${relativePath}`);
        continue;
      }
      
      let originalContent = '';
      try {
        originalContent = await fs.readFile(file.path, 'utf8');
      } catch (error) {
        console.log(`Error reading file ${file.path}:`, error);
        textOutput += `<artifact file="${relativePath}" contentsIncluded="false">\n</artifact>\n`;
        continue;
      }
      
      textOutput += `<artifact file="${relativePath}">\n`;
      textOutput += originalContent.split('\n').map(line => `  ${line}`).join('\n') + '\n';
      textOutput += `</artifact>\n`;
      fileCount++;
      
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const outputSize = Buffer.byteLength(textOutput, 'utf8');
  console.log(`Generated text output size: ${outputSize} bytes`);
  
  return fileCount > 0 ? textOutput : `No files found in ${sourceDir} directory`;
}

module.exports = { getFiles };