const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { loadIgnorePatterns, loadNoContentsPatterns, scanDirectory } = require('./utils');
const fastGlob = require('fast-glob');
const { execSync } = require('child_process');
const logger = require('./utils/logger');

// Buffer to store attempt diffs
let diffBuffer = [];
let attemptCount = 0;

// Simple diff function for number comparison (used in tests)
function diff(a, b) {
  return a - b;
}

// Function to generate and store a diff
async function generateDiff() {
  logger.git('Generating diff...');
  logger.debug(`Current diff buffer size: ${diffBuffer.length}`);
  
  // Remove stale git lock file if it exists
  const lockFile = path.join(process.cwd(), '.git', 'index.lock');
  if (fs.existsSync(lockFile)) {
    logger.warn('Found stale git lock file, removing...');
    try {
      fs.unlinkSync(lockFile);
      logger.success('Git lock file removed successfully');
    } catch (error) {
      logger.error('Error removing git lock file:', error.message);
    }
  }

  const retry = async (fn, retries = 3, delay = 1000) => {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      logger.warn(`Retrying operation, ${retries} attempts remaining...`);
      return retry(fn, retries - 1, delay);
    }
  };

  try {
    // First check if we're in a git repository
    await retry(async () => {
      try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
        logger.git('Git repository detected');
      } catch (error) {
        logger.git('Initializing git repository...');
        execSync('git init', { stdio: 'pipe' });
        execSync('git config user.email "auto@example.com"', { stdio: 'pipe' });
        execSync('git config user.name "Auto Commit"', { stdio: 'pipe' });
        logger.success('Git repository initialized and configured');
      }
    });

    // Get status before staging
    const beforeStatus = await retry(async () => 
      execSync('git status --short', { encoding: 'utf-8' })
    );
    logger.git('Files to be staged:', beforeStatus || 'none');

    // Stage all changes
    await retry(() => {
      execSync('git add -A', { stdio: 'pipe' });
      logger.success('Changes staged successfully');
    });
    
    // Get status after staging
    const afterStatus = await retry(() => 
      execSync('git status --short', { encoding: 'utf-8' })
    );
    logger.git('Staged files:', afterStatus || 'none');
    
    // Get the diff of staged changes
    const diff = await retry(() => 
      execSync('git diff --cached --no-ext-diff --no-color', { encoding: 'utf-8' })
    );
    logger.debug('Diff generated, length:', diff.length, 'characters');
    
    if (diff.trim()) {
      // Store diff before committing to ensure we capture it
      const count = (diffBuffer.find(d => d.diff === diff)?.count || 0) + 1;
      diffBuffer.push({
        count: count,
        diff: diff,
        attemptCount: attemptCount
      });
      logger.git(`Stored diff for attempt ${count} (${diff.split('\n').length} lines)`);
      logger.debug(`New diff buffer size: ${diffBuffer.length}`);

      // Now commit the changes
      await retry(() => {
        execSync('git commit -m "Changes from attempt ' + count + '"', { stdio: 'pipe' });
        logger.success('Changes committed successfully');
      });
      return diff;
    } else {
      logger.info('No changes detected in git diff');
      // Log the current git state for debugging
      const gitState = {
        status: execSync('git status', { encoding: 'utf-8' }),
        head: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }),
        lastCommit: execSync('git log -1 --oneline', { encoding: 'utf-8' })
      };
      return '';
    }
  } catch (error) {
    logger.error('Error in generateDiff:', error.message);
    logger.debug('Current working directory:', process.cwd());
    // If it's a git error, show more details
    if (error.message.includes('git')) {
      try {
        const diagnostics = {
          status: execSync('git status', { encoding: 'utf-8' }),
          config: execSync('git config --list', { encoding: 'utf-8' }),
          head: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }),
          lastCommit: execSync('git log -1 --oneline', { encoding: 'utf-8' })
        };
        logger.error('Git diagnostics:', diagnostics);
      } catch (diagError) {
        logger.error('Could not get git diagnostics:', diagError.message);
      }
    }
    return '';
  }
}

// Function to get all stored diffs in XML format
function getDiffBufferStatus() {
  logger.debug(`Buffer size: ${diffBuffer.length}`);
  logger.debug(`Buffer contents: ${JSON.stringify(diffBuffer.map(d => ({ count: d.count, lines: d.diff.split('\n').length })))}`);
  
  if (diffBuffer.length === 0) {
    logger.info('No diffs stored in buffer');
    return '';
  }

  // Get current git status
  try {
    const status = execSync('git status --porcelain').toString();
    logger.git('Current git status:', status || 'Clean working directory');
  } catch (error) {
    logger.error('Could not get git status:', error.message);
  }

  // Process each diff
  let xml = '';
  let attemptCount = 0;
  for (const { diff, count } of diffBuffer) {
    xml += `<diff attempt="${count}">${diff}</diff>\n`;
    ++attemptCount;
  }

  logger.debug(`Generated XML with ${diffBuffer.length} diff tags`);
  return xml;
}

// Function to clear diff buffer
function clearDiffBuffer() {
  diffBuffer = [];
  logger.success('Cleared diff buffer');
}

async function getFiles() {
  // Ensure .gitignore exists before scanning
  await ensureGitignore();
  
  const codebaseDir = path.join(__dirname, '..'); // Parent directory of src
  const currentDir = process.cwd();
  
  logger.info(`Loading ignore patterns from:\n- Codebase: ${codebaseDir}\n- Current: ${currentDir}`);
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
  
  logger.info(`Total files included: ${files.length}`);
  const relativeFiles = files.map(file => path.relative(currentDir, file));
  
  // Format files in XML schema
  const xmlFiles = await Promise.all(relativeFiles.map(async (file) => {
    const filePath = path.join(currentDir, file);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return `\n<file path="${file.replace(/\\/g, '/')}">\n${content}\n</file>\n`;
    } catch (error) {
      logger.error(`Error reading file ${filePath}: ${error.message}`);
      return `\n<file path="${file.replace(/\\/g, '/')}"></file>\n`;
    }
  })).then(files => files.join('\n'));
  return xmlFiles;
}

async function loadIgnoreFiles(directory) {
  const ignoreFiles = ['.llmignore', '.nocontents'];
  const patterns = [];
  
  logger.debug(`Checking for ignore files in: ${directory}`);
  
  for (const file of ignoreFiles) {
    const filePath = path.join(directory, file);
    if (fs.existsSync(filePath)) {
      logger.file(`Found ignore file: ${filePath}`);
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

async function ensureGitignore() {
  const currentGitignore = path.join(process.cwd(), '.gitignore');
  const sourceGitignore = path.join(__dirname, '../.gitignore');
  
  if (!fs.existsSync(currentGitignore)) {
    try {
      const content = await fsp.readFile(sourceGitignore, 'utf8');
      await writeFile(currentGitignore, content);
      logger.success(`Copied .gitignore from tool to current directory`);
    } catch (error) {
      logger.error('Failed to copy .gitignore:', error.message);
      logger.debug(`Source gitignore path: ${sourceGitignore}`);
      logger.debug(`Target gitignore path: ${currentGitignore}`);
    }
  }
}

module.exports = {
  getFiles,
  generateDiff,
  getDiffBufferStatus,
  clearDiffBuffer,
  diff,
  writeFile,
  ensureGitignore
};
