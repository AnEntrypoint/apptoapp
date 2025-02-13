const fs = require('fs').promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');
const fastGlob = require('fast-glob');

function diff(a, b) {
  return a - b;
}

async function readDirRecursive(dir, ig) {
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => ({ path: path.resolve(fullPath) }));

  const emptyFolders = await fs.readdir(dir);
  await Promise.all(emptyFolders.map(async (folder) => {
    const fullPath = path.join(dir, folder);
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      const filesInFolder = await fs.readdir(fullPath);
      if (filesInFolder.length === 0) {
        console.log(`Found empty folder: ${fullPath}`);
        result.push({ path: `${path.resolve(fullPath)}/` });
      }
    }
  }));
  return result;
}

async function getFiles() {
  const codebaseDir = path.join(__dirname, '..'); // Parent directory of src
  const currentDir = process.cwd();
  
  // Check for ignore files in codebase directory first
  const codebaseIgnores = await loadIgnoreFiles(codebaseDir);
  // Then check current directory
  const currentIgnores = await loadIgnoreFiles(currentDir);
  
  const ignorePatterns = [...codebaseIgnores, ...currentIgnores];
  
  const files = await fastGlob(['**/*'], {
    cwd: codebaseDir, // Always scope to codebase directory
    ignore: ignorePatterns,
    dot: true,
    onlyFiles: true,
    absolute: true
  });
  
  return files.map(file => path.relative(codebaseDir, file)).join('\n');
}

async function loadIgnoreFiles(directory) {
  const ignoreFiles = ['.llmignore', '.nocontents'];
  const patterns = [];
  
  for (const file of ignoreFiles) {
    const filePath = path.join(directory, file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      patterns.push(...content.split('\n').filter(line => line.trim()));
    }
  }
  
  return patterns;
}

module.exports = { getFiles, diff };
