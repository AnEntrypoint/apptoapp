const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { loadIgnorePatterns, scanDirectory } = require('./utils');

async function readDirRecursive(dir, ig) {
  console.log(`Reading directory recursively: ${dir}`);
  // Use the unified scanDirectory with a handler that preserves the UI component check
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => {
    console.log(`[DEBUG] Processing path: ${relativePath}`);
    const pathParts = relativePath.split(path.sep);
    const isUIComponent = pathParts.includes('components') &&
                          pathParts.includes('ui') &&
                          pathParts.indexOf('ui') === pathParts.indexOf('components') + 1;
    console.log(`Processing file: ${fullPath}, isUIComponent: ${isUIComponent}`);
    return { path: fullPath, includeContent: !isUIComponent };
  });
  console.log(`Finished reading directory: ${dir}, found ${result.length} files`);
  return result;
}

async function createDiff(preferredDir) {
  // Use the provided directory, or default to the current working directory
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
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file.path).replace(/\\/g, '/');
      console.log(`Processing file: ${file.path}, source-relative path: ${relativePath}`);
      
      // Include only filenames for UI components
      if (file.includeContent) {
        console.log('Including content for file:', file.path);
        diffOutput += `# ${relativePath}\n`;
      } else {
        console.log('Skipping content for UI component:', file.path);
        diffOutput += `# ${relativePath}\n`;
      }
      
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const diffSize = Buffer.byteLength(diffOutput, 'utf8');
  console.log(`Generated diff size: ${diffSize} bytes`);
  
  return diffOutput || `No files found in ${sourceDir} directory`;
}

(async () => {
  console.log('Starting diff creation...');
  const diff = await createDiff();
  console.log('Diff creation completed:', diff);
})();

module.exports = { createDiff };