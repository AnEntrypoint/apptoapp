const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');
const fastGlob = require('fast-glob');
const { execSync } = require('child_process');

// Buffer to store attempt diffs
let diffBuffer = [];

// Simple diff function for number comparison (used in tests)
function diff(a, b) {
  return a - b;
}

// Function to generate and store a diff
async function generateDiff() {
  console.log('Generating diff for current attempt...');
  console.log(`Current diff buffer size: ${diffBuffer.length}`);
  
  // Function to remove git lock file if it exists
  const cleanGitLock = () => {
    const lockFile = path.join(process.cwd(), '.git', 'index.lock');
    if (fs.existsSync(lockFile)) {
      console.log('Found stale git lock file, removing...');
      try {
        fs.unlinkSync(lockFile);
        console.log('Git lock file removed successfully');
      } catch (error) {
        console.error('Error removing git lock file:', error.message);
      }
    }
  };

  // Clean any existing lock file before starting
  cleanGitLock();

  const retry = async (fn, retries = 3, delay = 1000) => {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      console.log(`Retrying operation, ${retries} attempts remaining...`);
      cleanGitLock(); // Clean lock file before retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay);
    }
  };

  try {
    // First check if we're in a git repository
    await retry(async () => {
      try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
        console.log('Git repository detected');
      } catch (error) {
        console.log('Initializing git repository...');
        execSync('git init', { stdio: 'pipe' });
        execSync('git config user.email "auto@example.com"', { stdio: 'pipe' });
        execSync('git config user.name "Auto Commit"', { stdio: 'pipe' });
        console.log('Git repository initialized and configured');
      }
    });

    // Get status before staging
    const beforeStatus = await retry(() => 
      execSync('git status --short', { encoding: 'utf-8' })
    );
    console.log('Files to be staged:', beforeStatus || 'none');

    // Stage all changes
    await retry(() => {
      execSync('git add -A', { stdio: 'pipe' });
      console.log('Changes staged successfully');
    });
    
    // Get status after staging
    const afterStatus = await retry(() => 
      execSync('git status --short', { encoding: 'utf-8' })
    );
    console.log('Staged files:', afterStatus || 'none');
    
    // Get the diff of staged changes
    const diff = await retry(() => 
      execSync('git diff --cached', { encoding: 'utf-8' })
    );
    console.log('Diff generated, length:', diff.length, 'characters');
    
    if (diff.trim()) {
      // Store diff before committing to ensure we capture it
      const attemptCount = diffBuffer.length + 1;
      diffBuffer.push({
        count: attemptCount,
        diff: diff
      });
      console.log(`Stored diff for attempt ${attemptCount} (${diff.split('\n').length} lines)`);
      console.log(`New diff buffer size: ${diffBuffer.length}`);

      // Now commit the changes
      await retry(() => {
        execSync('git commit -m "Changes from attempt ' + attemptCount + '"', { stdio: 'pipe' });
        console.log('Changes committed successfully');
      });
    } else {
      console.log('No changes detected in git diff');
      // Log the current git state for debugging
      const gitState = {
        status: execSync('git status', { encoding: 'utf-8' }),
        head: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }),
        lastCommit: execSync('git log -1 --oneline', { encoding: 'utf-8' })
      };
      console.log('Current git state:', gitState);
    }
  } catch (error) {
    console.error('Error in generateDiff:', error.message);
    console.error('Current working directory:', process.cwd());
    // If it's a git error, show more details
    if (error.message.includes('git')) {
      try {
        const diagnostics = {
          status: execSync('git status', { encoding: 'utf-8' }),
          config: execSync('git config --list', { encoding: 'utf-8' }),
          head: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }),
          lastCommit: execSync('git log -1 --oneline', { encoding: 'utf-8' })
        };
        console.error('Git diagnostics:', diagnostics);
      } catch (diagError) {
        console.error('Could not get git diagnostics:', diagError.message);
      }
    }
  }
}

// Function to get all stored diffs in XML format
function getDiffsAsXML() {
  console.log(`\n\n------ DIFF BUFFER STATUS ------`);
  console.log(`Buffer size: ${diffBuffer.length}`);
  console.log(`Buffer contents: ${JSON.stringify(diffBuffer.map(d => ({ count: d.count, lines: d.diff.split('\n').length })))}`);
  
  if (diffBuffer.length === 0) {
    console.log('No diffs stored in buffer');
    // Log git status for debugging
    try {
      const status = execSync('git status --short', { encoding: 'utf-8' });
      console.log('Current git status:', status || 'Clean working directory');
    } catch (error) {
      console.error('Could not get git status:', error.message);
    }
    return '';
  }
  
  const xml = diffBuffer.map(({ count, diff }) => {
    const lines = diff.split('\n').length;
    console.log(`Processing diff ${count} with ${lines} lines`);
    return `<attemptDiff count="${count}">${diff}</attemptDiff>`;
  }).join('\n');
  
  console.log(`Generated XML with ${diffBuffer.length} diff tags`);
  console.log(`------ END DIFF BUFFER STATUS ------\n\n`);
  return xml;
}

// Function to clear diff buffer
function clearDiffBuffer() {
  diffBuffer = [];
  console.log('Cleared diff buffer');
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
  writeFile,
  generateDiff,
  getDiffsAsXML,
  clearDiffBuffer,
  diff
};
