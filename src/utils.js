const fsp = require('fs').promises;
const ignore = require('ignore');
const path = require('path');
const { exec } = require('child_process');

const cmdhistory = [];

function sum(a, b) {
  return a + b;
}

function product(a, b) {
  return a * b;
}

async function executeCommand(command, logHandler = null, options = {}) {
  console.log('Executing command:', command);
  console.log('Command history size:', cmdhistory.join().length, 'B');
  return new Promise((resolve, reject) => {
    try {
      const child = exec(command, {
        timeout: 120000,
        cwd: process.cwd(),
        ...options,
      });
      cmdhistory.push(command);
      if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100);

      const output = { stdout: [], stderr: [] };
      let isResolved = false;

      child.stdout.on('data', (data) => {
        const trimmed = data.toString().trim();
        cmdhistory.push(trimmed);
        if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100);
        output.stdout.push(trimmed);
        if (logHandler) {
          logHandler(trimmed);
        } else {
          console.log(`[CMD] ${trimmed}`);
        }
      });

      child.stderr.on('data', (data) => {
        const trimmed = data.toString().trim();
        cmdhistory.push(trimmed);
        if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100);
        output.stderr.push(trimmed);
        // console.error(`[CMD-ERR] ${trimmed}`);
      });

      const cleanup = () => {
        if (!isResolved) {
          isResolved = true;
          child.stdout.removeAllListeners();
          child.stderr.removeAllListeners();
          child.removeAllListeners();
        }
      };

      child.on('close', (code) => {
        if (!isResolved) {
          cleanup();
          resolve({
            code,
            stdout: output.stdout.join('\n'),
            stderr: output.stderr.join('\n'),
            kill: () => child.kill(),
          });
        }
      });

      child.on('error', (error) => {
        console.error('Command execution error:', error);
        if (!isResolved) {
          cleanup();
          reject(new Error(`Command failed: ${error.message}`));
        }
      });

      // Attach kill method to the promise
      child.kill = () => {
        cleanup();
        child.kill('SIGTERM');
      };
    } catch (error) {
      console.error('Command initialization error:', error);
      reject(new Error(`Command initialization failed: ${error.message}`));
    }
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
      console.log(`Loaded ignore patterns from ${path.relative(process.cwd(), filePath)}`);
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
      console.log(`Loaded nocontents patterns from ${path.relative(process.cwd(), filePath)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return ig;
}

async function makeApiRequest(messages, tools, apiKey, endpoint) {
  // console.trace();
  const data = [endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'codestral-latest',
      messages,
      tool_choice: 'any',
      tools,
      stream: false,
    }),
  }];
  console.log('waiting for api request...');
  const response = await fetch(...data);
  console.log('api request done');

  async function writeToLastCall(data) {
    try {
      await fsp.writeFile('../lastcall.txt', data, 'utf8');
    } catch (error) {
      console.error('Error writing to lastcall.txt:', error);
    }
  }
  if (!response.ok) {
    writeToLastCall(response);
    const error = await response.json();
    console.error('API Error:', JSON.stringify(error, null, 2));
    throw new Error(`API error: ${error.message || response.statusText}`);
  }
  const val = await response.json();
  return val;
}

async function directoryExists(dir) {
  try {
    await fsp.access(dir);
    console.log(`Directory exists: ${dir}`);
    return true;
  } catch {
    console.log(`Directory does not exist: ${dir}`);
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
    //console.error('Error reading .cursor/rules:', error);
    return '';
  }
}

// Add helper to show current working directory
function getCWD() {
    return process.cwd();
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
