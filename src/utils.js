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
  console.log('Command history size:', cmdhistory.join().length, 'B');
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      timeout: 120000,
      cwd: process.cwd(),
      ...options,
    });
    cmdhistory.push(command);
    if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100);

    const output = { stdout: [], stderr: [] };

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

    child.on('close', (code) => {
      console.log(`Command closed with code: ${code}`);
      resolve({
        code,
        stdout: output.stdout.join('\n'),
        stderr: output.stderr.join('\n'),
        kill: () => child.kill(),
      });
    });

    child.on('error', (error) => {
      console.error(`Command error: ${error}`);
      reject(error);
    });

    // Attach kill method to the promise
    child.kill = () => {
      child.kill('SIGTERM');
    };
  });
}

async function loadIgnorePatterns(ignoreFile = '.llmignore') {
  const sourcePath = path.join(__dirname, ignoreFile);

  const ignoreFiles = [ignoreFile, sourcePath];
  let ignoreContent = '';

  for (const file of ignoreFiles) {
    try {
      ignoreContent = await fsp.readFile(file, 'utf8');
      return ignore().add(ignoreContent.split('\n').filter((l) => !l.startsWith('#')));
    } catch (error) {
      if (error.code === 'ENOENT') {
      } else {
        throw error;
      }
    }
  }

  console.log('No ignore files found, using empty ignore list');
  return ignore();
}

async function loadNoContentsPatterns(ignoreFile = '.nocontents') {
  const currentPath = process.cwd();
  const sourcePath = path.join(__dirname, ignoreFile);

  let ignoreContent = '';

  try {
    ignoreContent = await fsp.readFile(sourcePath, 'utf8');
    return ignore().add(ignoreContent.split('\n').filter((l) => !l.startsWith('#')));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return ignore();
    }
  }
}

async function makeApiRequest(messages, tools, apiKey, endpoint) {
  //console.trace();
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
  const response = await fetch(...data);

  async function writeToLastCall(data) {
    try {
      await fsp.writeFile('../lastcall.txt', data, 'utf8');
    } catch (error) {
      console.error('Error writing to lastcall.txt:', error);
    }
  }

  if (!response.ok) {
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

async function createErrorNote(errorDetails) {
  const timestamp = new Date().toISOString();
  const noteContent = `[${timestamp}] Error in ${errorDetails.tool || 'unknown-tool'} (${errorDetails.phase || 'unknown-phase'}): ${errorDetails.error}\n${
    errorDetails.stack ? `Stack: ${errorDetails.stack}\n` : ''}`;
  try {
    await fsp.appendFile('NOTES.txt', `\n${noteContent}\n`, 'utf8');
  } catch (err) {
    console.error('Failed to write error note:', err);
  }
  return noteContent;
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

module.exports = {
  loadIgnorePatterns,
  loadNoContentsPatterns,
  makeApiRequest,
  directoryExists,
  scanDirectory,
  createErrorNote,
  executeCommand,
  cmdhistory,
  sum,
  product,
  loadCursorRules,
};
