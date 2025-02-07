const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { createPatch } = require('diff');
const { loadIgnorePatterns, scanDirectory } = require('./utils');

async function readDirRecursive(dir, ig) {
  // Use the unified scanDirectory with a handler that preserves the UI component check
  return await scanDirectory(dir, ig, (fullPath, relativePath) => {
    const pathParts = relativePath.split(path.sep);
    const isUIComponent = pathParts.includes('components') &&
                          pathParts.includes('ui') &&
                          pathParts.indexOf('ui') === pathParts.indexOf('components') + 1;
    return { path: fullPath, includeContent: !isUIComponent };
  });
}

async function createDiff(preferredDir) {
  console.log('Starting diff creation');
  const sourceDir = './';
  
  if (!sourceDir) {
    console.log('No source directory found');
    throw new Error('Neither /app nor /src directory found');
  }
  
  console.log('Using source directory: %s', sourceDir);
  const ig = await loadIgnorePatterns();
  const files = await readDirRecursive(sourceDir, ig);
  let diffOutput = '';
  
  for (const file of files) {
    try {
      const relativePath = path.relative(process.cwd(), file.path);
      
      if (file.includeContent) {
        const content = await fs.readFile(file.path, 'utf8');
        console.log(" - ",`${file.path} (${content.length}B)`);
        const patch = createPatch(relativePath, '', content);
        diffOutput += patch + '\n';
      } else {
        diffOutput += `# ${relativePath}\n`;
      }
      
    } catch (error) {
      console.log('Error processing file %s: %O', file.path, error);
      console.error(`Error processing file ${file.path}:`, error);
    }
  }
  
  const diffSize = Buffer.byteLength(diffOutput, 'utf8');
  console.log('Diff creation completed. Total size: %d bytes', diffSize);
  console.log(`Generated diff size: ${diffSize} bytes`);
  
  return diffOutput || `No files found in ${sourceDir} directory`;
}

module.exports = { createDiff };