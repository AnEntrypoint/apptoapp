const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');
const fastGlob = require('fast-glob');

function diff(a, b) {
  return a - b;
}

async function readDirRecursive(dir, ig) {
  const result = await scanDirectory(dir, ig, (fullPath, relativePath) => ({ path: path.resolve(fullPath) }));

  const emptyFolders = await fsp.readdir(dir);
  await Promise.all(emptyFolders.map(async (folder) => {
    const fullPath = path.join(dir, folder);
    const stats = await fsp.stat(fullPath);
    if (stats.isDirectory()) {
      const filesInFolder = await fsp.readdir(fullPath);
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
  
  console.log(`Loading ignore patterns from:\n- Codebase: ${codebaseDir}\n- Current: ${currentDir}`);

  // Check for ignore files in codebase directory first
  const codebaseIgnores = await loadIgnoreFiles(codebaseDir);
  // Then check current directory
  const currentIgnores = await loadIgnoreFiles(currentDir);
  
  const files = await fastGlob(['**/*'], {
    cwd: codebaseDir,
    ignore: [
      ...new Set([...codebaseIgnores, ...currentIgnores]), // Remove duplicates
      '**/.git/**'
    ],
    dot: true,
    onlyFiles: true,
    absolute: true,
    case: false // Windows-friendly case insensitivity
  });
  
  console.log(`Total files included: ${files.length}`);
  return files.map(file => path.relative(codebaseDir, file)).join('\n');
}

async function loadIgnoreFiles(directory) {
  const ignoreFiles = ['.llmignore', '.nocontents'];
  const patterns = [];
  
  console.log(`Checking for ignore files in: ${directory}`);
  
  for (const file of ignoreFiles) {
    const filePath = path.join(directory, file);
    if (fs.existsSync(filePath)) {
      console.log(`Found ignore file: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf-8');
      const cleaned = content
        .split(/\r?\n/) // Handle both LF and CRLF
        .map(line => line.replace(/\s+$/, '')) // Remove trailing whitespace
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(pattern => {
          // Normalize directory patterns
          pattern = pattern.replace(/\/$/, '/**'); // Convert dir/ to dir/**
          if (pattern.startsWith('/')) return pattern.slice(1);
          if (!pattern.includes('/') && !pattern.startsWith('*')) {
            return `**/${pattern}`;
          }
          return pattern;
        });
      patterns.push(...cleaned);
    }
  }
  
  return patterns;
}

function writeFile(filename, content) {
    const targetDir = process.cwd();
    const filePath = path.resolve(targetDir, filename);
    
    console.log(`[FS] Attempting write to: ${filePath}`);
    
    // Create parent directories if needed
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
        console.log(`[FS] Creating directory: ${parentDir}`);
        fs.mkdirSync(parentDir, { recursive: true });
    }
    
    // Verify write permissions
    try {
        fs.accessSync(parentDir, fs.constants.W_OK);
    } catch (error) {
        throw new Error(`No write permissions for directory: ${parentDir}`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`[FS] Write successful: ${filePath}`);
}

module.exports = { 
    getFiles, 
    diff,
    writeFile  // Add to exports
};
