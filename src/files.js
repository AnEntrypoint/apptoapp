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
      return `<file path="${file}">${content}</file>`;
    } catch (error) {
      console.error(`Error reading file ${filePath}: ${error.message}`);
      return `<file path="${file}"></file>`;
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
    // Ensure the directory exists
    const dir = path.dirname(filePath);

    // Check if the directory exists
    try {
      await fs.access(dir);
    } catch (accessError) {
      throw new Error(`Directory does not exist: ${dir}`);
    }

    // Check if the directory is writable
    try {
      await fs.access(dir, fs.constants.W_OK);
    } catch (accessError) {
      throw new Error(`Cannot write to directory: ${dir}`);
    }

    // Write the file
    console.log(`Writing to ${filePath}`);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    // Explicitly handle different error cases
    if (error.code === 'ENOENT') {
      throw new Error(`Cannot write to path: ${filePath}`);
    }
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied: ${filePath}`);
    }
    throw error;
  }
}

module.exports = {
  getFiles,
  writeFile
};
