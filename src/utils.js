const fsp = require('fs').promises;
const ignore = require('ignore');
const path = require('path');
const { exec, spawn } = require('child_process');
const logger = require('./utils/logger');
const { createLLMProvider } = require('./llm/providers');

const cmdhistory = [];

function sum(a, b) {
  return a + b;
}

function product(a, b) {
  return a * b;
}

async function executeCommand(command, logHandler = null, options = {}) {
  logger.system('Executing command:', command);
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      timeout: options.timeout || 300000, // 5 minute default timeout
      ...options
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        kill: () => child.kill()
      });
    });

    if (logHandler) {
      child.stdout.on('data', logHandler);
      child.stderr.on('data', logHandler);
    }

    // Attach kill method to the promise
    child.kill = () => {
      child.kill('SIGTERM');
    };
  });
}

async function loadIgnorePatterns(ignoreFile = '.llmignore') {
  // Check both current working directory and codebase directory
  const ignorePaths = [
    path.join(process.cwd(), ignoreFile),
    path.join(__dirname, ignoreFile)
  ];
  const ig = ignore();
  
  for (const filePath of ignorePaths) {
    try {
      const content = await fsp.readFile(filePath, 'utf8');
      ig.add(content.split('\n').filter(l => !l.startsWith('#')));
      logger.info(`Loaded ignore patterns from ${path.relative(process.cwd(), filePath)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return ig;
}

async function loadNoContentsPatterns(ignoreFile = '.nocontents') {
  // Check both current working directory and codebase directory
  const ignorePaths = [
    path.join(process.cwd(), ignoreFile),
    path.join(__dirname, ignoreFile)
  ];
  const ig = ignore();

  for (const filePath of ignorePaths) {
    try {
      const content = await fsp.readFile(filePath, 'utf8');
      ig.add(content.split('\n').filter(l => !l.startsWith('#')));
      logger.info(`Loaded nocontents patterns from ${path.relative(process.cwd(), filePath)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return ig;
}

async function makeApiRequest(messages, tools, apiKey, endpoint, model = 'mistral') {
  console.log(`Using ${model} model`);
  console.log(`Provider selection: Using Mistral with key ${apiKey?.slice(0, 5)}...`);
  
  const provider = createLLMProvider(apiKey);
  logger.info(`Using Mistral provider for API request...`);
  
  try {
    const response = await provider.makeRequest(messages, tools);
    
    try {
      await fsp.writeFile('../lastresponse.txt', JSON.stringify(response, null, 2), 'utf8');
      logger.success('API response written to lastresponse.txt');
    } catch (error) {
      logger.error('Error writing to lastresponse.txt:', error);
    }
    
    return response;
  } catch (error) {
    logger.error(`API Error with Mistral:`, error);
    throw error;
  }
}

async function directoryExists(dir) {
  try {
    await fsp.access(dir);
    logger.file(`Directory exists: ${dir}`);
    return true;
  } catch {
    logger.file(`Directory does not exist: ${dir}`);
    return false;
  }
}

async function scanDirectory(dir, ig, handler, baseDir = dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (ig.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...await scanDirectory(fullPath, ig, handler, baseDir));
    } else {
      const result = handler(fullPath, relativePath);
      results.push(result);
    }
  }

  return results;
}

async function loadCursorRules() {
  try {
    const rulesContent = await fsp.readFile('.cursor/rules', 'utf8');
    return rulesContent;
  } catch (error) {
    console.error('Error reading .cursor/rules:', error);
    return '';
  }
}

// Add helper to show current working directory
function getCWD() {
    return process.cwd();
}

// Add this helper function
function killProcessGroup(pid) {
  try {
    if (process.platform === 'win32') {
      logger.system(`Terminating process tree for PID ${pid}`);
      require('child_process').execSync(
        `taskkill /F /T /PID ${pid}`, 
        { stdio: 'ignore', timeout: 60000 }
      );
      // Additional cleanup for Windows service hosts
      require('child_process').execSync(
        `taskkill /F /IM conhost.exe /T`,
        { stdio: 'ignore' }
      );
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (error) {
    logger.error(`Process group termination error: ${error.message}`);
  }
}

module.exports = {
  loadIgnorePatterns,
  loadNoContentsPatterns,
  makeApiRequest,
  directoryExists,
  scanDirectory,
  executeCommand,
  cmdhistory,
  sum,
  product,
  loadCursorRules,
  getCWD
};
