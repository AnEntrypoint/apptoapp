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

async function executeCommand(command, history = true) {
  logger.system('Executing command:', command);
  return new Promise((resolve) => {
    const child = exec(command, {
      timeout: 300000, // 5 minute default timeout
    }, (error, stdout, stderr) => {
      if(history) {
        cmdhistory.push(command);
        if(stdout && stdout.length) {
          cmdhistory.push('stdout:');
          cmdhistory.push(stdout.toString());
        }
        if(stderr && stderr.length) {
          cmdhistory.push('stderr:');
          cmdhistory.push(stderr.toString());
        }
      }
      resolve({
        code: error ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        kill: () => child.kill()
      });
    });
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
      const isTimeout = error.message.includes('timed out') || error.name === 'AbortError';
      console.error(`[Provider Chain] ${providerType} provider ${isTimeout ? 'timed out' : 'failed'}:`, error.message);
      return { 
        failed: true, 
        error: error.message,
        isTimeout
      };
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
    const reason = response.isTimeout ? 'timed out' : 'failed';
    console.log(`[Provider Chain] Mistral ${reason}, attempting Together AI`);
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
    const reason = response.isTimeout ? 'timed out' : 'failed';
    console.log(`[Provider Chain] Together AI ${reason}, attempting OpenRouter`);
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
    const reason = response.isTimeout ? 'timed out' : 'failed';
    console.log(`[Provider Chain] OpenRouter ${reason}, attempting Groq as final fallback`);
  }

  // Try Groq as final fallback
  const groqKey = process.env.GROQ_API_KEY;
  response = await tryProvider('groq', groqKey);
  if (response.success) {
    console.log('[Provider Chain] Successfully switched to Groq');
    if (onModelChange) onModelChange('groq');
    return response.result;
  }

  // If we get here, all providers have failed
  const errorMessage = `Failed to get response from any available provider. Last error: ${response.error}`;
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
  const rulesPath = path.join(process.cwd(), '.cursor/rules'); // Read from the current directory

  try {
    const rulesContent = await fsp.readFile(rulesPath, 'utf8');
    console.log('Successfully loaded cursor rules from:', rulesPath); // Added console log for debugging
    return rulesContent;
  } catch (error) {
    
    console.error('Error reading cursor rules from', rulesPath, ':', error); // Updated error message for clarity
    return         + '\n// Code Quality\n'
    + `Write clean, DRY, maintainable code following SOLID principles\n`
    + `Focus on readability and complete implementations\n`
    + `Use functional/declarative patterns and avoid classes\n`
    + `For TypeScript: Maintain strong type safety\n`
    + `For JavaScript: Use latest language features\n`
    + `Always refactor files with over 100 lines into smaller modules\n`
    + `Minimize interdependencies between functions\n`
    + `Maximise code reuse and generalization\n`

    + '\n// Testing & Debugging\n'
    + `always look in the <diff> tags for the original code if any code was replaced by placeholder or todo type comments\n`
    + `Write comprehensive unit and integration tests\n`
    + `Write tests to discover and fix bugs\n`
    + `Always try to fix all known errors at once\n`
    + `Always analyze <diff> tags as well as <cmdhistory> and <history> and <attemptSummary> tags carefully to avoid repetitive fixes\n`
    + `Look at the logs and history, if the history indicates you are having trouble fixing the errors repeatedly, pick a different approach\n`
    + `always make 100% sure that none of the tests will get stuck, apply strategies to avoid that\n`
    + `never run npm test or npm run test, instead run the individual test files directly when you need to debug\n`

    + '\n// File Management\n'
    + `Use consistent file structure\n`
    + `Separate tests into their own folder\n`
    + `Only create necessary files in correct locations\n`
    + `Don't output unchanged files\n`

    + '\n// Dependency Management\n'
    + `Use CLI for package management with --save/--save-dev\n`
    + `Resolve conflicts by removing package-lock.json and reinstalling\n`

    + '\n// Documentation\n'
    + `Maintain clear JSDoc comments\n`
    + `Document user-facing text for i18n support\n`
    + `Explain changes in <text> tags with motivations and CLI commands, in past tense as if the tasks have been completed\n`

    + '\n// Output Formatting\n'
    + `Only respond in XML tags\n`
    + `Always provide the complete changed files, no partial files\n`

    + '\n// Performance & Security\n'
    + `Optimize performance while handling edge cases\n`
    + `Follow best practices for security and maintainability\n`
    + `Always Fix all test and linting errors and warnings in the <lint> tags\n`;
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

