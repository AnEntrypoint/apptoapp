const chalk = require('chalk');

// Maximum length for truncated strings
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 10;

// Log types with their corresponding colors and prefixes
const LOG_TYPES = {
  INFO: { color: chalk.blue, prefix: 'ℹ️', padLength: 8 },
  SUCCESS: { color: chalk.green, prefix: '✅', padLength: 9 },
  WARNING: { color: chalk.yellow, prefix: '⚠️', padLength: 9 },
  ERROR: { color: chalk.red, prefix: '❌', padLength: 7 },
  DEBUG: { color: chalk.gray, prefix: '🔍', padLength: 7 },
  SYSTEM: { color: chalk.magenta, prefix: '⚙️', padLength: 8 },
  GIT: { color: chalk.cyan, prefix: '📦', padLength: 5 },
  FILE: { color: chalk.white, prefix: '📄', padLength: 6 }
};

// Truncate long strings with better formatting
function truncate(str, maxLength = MAX_STRING_LENGTH) {
  if (typeof str !== 'string') {
    try {
      str = JSON.stringify(str, null, 2);
    } catch {
      str = String(str);
    }
  }
  if (str.length <= maxLength) return str;
  const truncated = str.substring(0, maxLength);
  const remaining = str.length - maxLength;
  return `${truncated}⟪ ${remaining} characters skipped ⟫`;
}

// Format objects and arrays with improved readability
function formatValue(value) {
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      const formatted = value.slice(0, MAX_ARRAY_LENGTH).map(formatValue);
      return `[${formatted.join(', ')}, ... (${value.length - MAX_ARRAY_LENGTH} more items)]`;
    }
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    try {
      const formatted = JSON.stringify(value, null, 2);
      return truncate(formatted);
    } catch {
      return '[Complex Object]';
    }
  }
  if (typeof value === 'string' && value.includes('\n')) {
    // Format multiline strings
    return '\n' + value.split('\n').map(line => '  ' + line).join('\n');
  }
  return truncate(String(value));
}

// Format log prefix
function formatPrefix(type) {
  const { color, prefix, padLength } = LOG_TYPES[type];
  const timestamp = new Date().toISOString();
  return color(`${prefix} [${timestamp}] ${type.padEnd(padLength)}`);
}

// Create logger functions
function createLogger(type) {
  return (...args) => {
    const prefix = formatPrefix(type);
    const formattedArgs = args.map(formatValue);
    console.log(prefix, ...formattedArgs);
  };
}

// Create logger instances
const info = createLogger('INFO');
const success = createLogger('SUCCESS');
const warn = createLogger('WARNING');
const error = createLogger('ERROR');
const debug = createLogger('DEBUG');
const system = createLogger('SYSTEM');
const git = createLogger('GIT');
const file = createLogger('FILE');

// Export logger functions and utilities
module.exports = {
  info,
  success,
  warn,
  error,
  debug,
  system,
  git,
  file,
  truncate,
  formatValue,
  formatPrefix,
  createLogger,
  LOG_TYPES,
  MAX_STRING_LENGTH,
  MAX_ARRAY_LENGTH
};
