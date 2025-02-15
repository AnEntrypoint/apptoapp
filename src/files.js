const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');
const fastGlob = require('fast-glob');


async function getFiles() {
  const codebaseDir = path.join(__dirname, '..'); // Parent directory of src
  const currentDir = process.cwd();
  
  console.log(`Loading ignore patterns from:\n- Codebase: ${codebaseDir}\n- Current: ${currentDir}`);
  // Check for ignore files in codebase directory first
  const codebaseIgnores = await loadIgnoreFiles(codebaseDir);
  // Then check current directory
  const currentIgnores = await loadIgnoreFiles(currentDir);
  
  const files = await fastGlob(['**/*'], {
    cwd: currentDir,
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
  const relativeFiles = files.map(file => path.relative(currentDir, file));
  
  // Format files in XML schema
  const xmlFiles = await Promise.all(relativeFiles.map(async (file) => {
    const filePath = path.join(currentDir, file);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return `\n<file path="${file.replace(/\\/g, '/')}">\n${content}\n</file>\n`;
    } catch (error) {
      console.error(`Error reading file ${filePath}: ${error.message}`);
      return `\n<file path="${file.replace(/\\/g, '/')}"></file>\n`;
    }
  })).then(files => files.join('\n'));
  return xmlFiles;
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

async function writeFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    await fsp.mkdir(dir, { recursive: true }); // Windows needs explicit recursive creation
    
    // Retry logic for Windows file locking
    let retries = 3;
    while (retries-- > 0) {
      try {
        await fsp.writeFile(filePath, content, 'utf-8');
        return;
      } catch (error) {
        if (error.code === 'EPERM' && process.platform === 'win32') {
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    // Handle Windows-specific error codes
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw new Error(`Permission denied: ${filePath} - ${error.message}`);
    }
    throw error;
  }
}

module.exports = {
  getFiles,
  writeFile
};
