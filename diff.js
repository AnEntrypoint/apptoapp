const fs = require('fs').promises;
const path = require('path');
const ignore = require('ignore');
const { createPatch } = require('diff');

async function loadIgnorePatterns() {
  try {
    console.log('Loading .llmignore file');
    const ignoreContent = await fs.readFile('.llmignore', 'utf8');
    const ig = ignore().add(ignoreContent);
    console.log('Ignore patterns loaded successfully');
    return ig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No .llmignore file found, using empty ignore list');
      return ignore();
    }
    throw error;
  } 
}

async function readDirRecursive(dir, ig) {
  const files = [];
  
  async function scan(currentPath) {
    console.log('Scanning directory: %s', currentPath);
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        console.log('Found directory: %s', entry.name);
        await scan(fullPath);
      } else {
        const pathParts = relativePath.split(path.sep);
        const isUIComponent = pathParts.includes('components') && 
                             pathParts.includes('ui') &&
                             pathParts.indexOf('ui') === pathParts.indexOf('components') + 1;

        files.push({
          path: fullPath,
          includeContent: !isUIComponent
        });
        
      }
    }
  }
  
  try {
    await scan(dir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Directory not found: %s', dir);
      return [];
    }
    throw error;
  }
  
  console.log('Total files found: %d', files.length);
  return files;
}

async function directoryExists(dir) {
  try {
    await fs.access(dir);
    console.log('Directory exists: %s', dir);
    return true;
  } catch {
    console.log('Directory does not exist: %s', dir);
    return false;
  }
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