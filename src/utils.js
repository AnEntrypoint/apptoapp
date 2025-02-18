const fsp = require('fs').promises;
const ignore = require('ignore');
const path = require('path');
const { exec } = require('child_process');
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
  return new Promise((resolve) => {
    const child = exec(command, {
      timeout: options.timeout || 300000, // 5 minute default timeout
      ...options
    }, (error, stdout, stderr) => {
      cmdhistory.push(command);
      cmdhistory.push('stdout:');
      cmdhistory.push(stdout.toString());
      cmdhistory.push('stderr:');
      cmdhistory.push(stderr.toString());
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

async function makeApiRequest(messages, tools, apiKey, endpoint, model = 'mistral', onModelChange = null) {
  console.log('[Provider Chain] Making API request with model:', model);

  const tryProvider = async (providerType, key, ep) => {
    if (!key) {
      console.log(`[Provider Chain] Skipping ${providerType} - no API key configured`);
      return { skipped: true, error: 'No API key' };
    }

    let provider;
    try {
      console.log(`[Provider Chain] Initializing ${providerType} provider`);
      provider = createLLMProvider(providerType, key, ep);
    } catch (error) {
      console.error(`[Provider Chain] Failed to initialize ${providerType} provider:`, error.message);
      return { failed: true, error: error.message };
    }

    try {
      console.log(`[Provider Chain] Attempting request with ${providerType} provider`);
      const result = await provider.makeRequest(messages, tools);
      if (!result?.choices?.[0]?.message?.content) {
        console.error(`[Provider Chain] ${providerType} provider returned invalid response format`);
        return { failed: true, error: 'Invalid response format' };
      }
      console.log(`[Provider Chain] ${providerType} provider succeeded`);
      return { success: true, result };
    } catch (error) {
      console.error(`[Provider Chain] ${providerType} provider request failed:`, error.message);
      return { failed: true, error: error.message };
    }
  };

  // Try Mistral first
  console.log('[Provider Chain] Starting with Mistral');
  let response = await tryProvider('mistral', apiKey, endpoint);
  if (response.success) {
    console.log('[Provider Chain] Using response from Mistral');
    return response.result;
  }
  if (response.failed) {
    console.log('[Provider Chain] Mistral failed, attempting Together AI');
  }

  // Try Together if Mistral fails
  const togetherKey = process.env.TOGETHER_API_KEY;
  response = await tryProvider('together', togetherKey);
  if (response.success) {
    console.log('[Provider Chain] Successfully switched to Together AI');
    if (onModelChange) onModelChange('together');
    return response.result;
  }
  if (response.failed) {
    console.log('[Provider Chain] Together AI failed, attempting OpenRouter');
  }

  // Try OpenRouter if Together fails
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  response = await tryProvider('openrouter', openrouterKey);
  if (response.success) {
    console.log('[Provider Chain] Successfully switched to OpenRouter');
    if (onModelChange) onModelChange('openrouter');
    return response.result;
  }
  if (response.failed) {
    console.log('[Provider Chain] OpenRouter failed, attempting Groq as final fallback');
  }

  // Try Groq as final fallback
  const groqKey = process.env.GROQ_API_KEY;
  response = await tryProvider('groq', groqKey);
  if (response.success) {
    console.log('[Provider Chain] Successfully switched to Groq');
    if (onModelChange) onModelChange('groq');
    return response.result;
  }

  // If we get here, all providers have either failed or been skipped
  const errorMessage = response.failed ? 
    `All providers failed. Last error: ${response.error}` :
    'All providers were skipped due to missing API keys';
  
  console.error('[Provider Chain]', errorMessage);
  throw new Error(errorMessage);
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

