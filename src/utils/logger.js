const chalk = require('chalk');

// Maximum length for truncated strings
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 5;

// Log types with their corresponding colors and prefixes
const LOG_TYPES = {
  INFO: { color: chalk.blue, prefix: 'ℹ️' },
  SUCCESS: { color: chalk.green, prefix: '✅' },
  WARNING: { color: chalk.yellow, prefix: '⚠️' },
  ERROR: { color: chalk.red, prefix: '❌' },
  DEBUG: { color: chalk.gray, prefix: '🔍' },
  SYSTEM: { color: chalk.magenta, prefix: '⚙️' },
  GIT: { color: chalk.cyan, prefix: '📦' },
  FILE: { color: chalk.white, prefix: '📄' }
};

// Truncate long strings
function truncate(str, maxLength = MAX_STRING_LENGTH) {
  if (typeof str !== 'string') {
    str = JSON.stringify(str);
  }
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength)}... (${str.length - maxLength} more chars)`;
}

// Format objects and arrays
function formatValue(value) {
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return `[${value.slice(0, MAX_ARRAY_LENGTH).map(formatValue).join(', ')}, ... (${value.length - MAX_ARRAY_LENGTH} more items)]`;
    }
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    try {
      return truncate(JSON.stringify(value));
    } catch (error) {
      return '[Complex Object]';
    }
  }
  return truncate(String(value));
}

// Create logger functions
function createLogger(type) {
  const { color, prefix } = LOG_TYPES[type];
  return (...args) => {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(formatValue);
    console.log(
      color(`${prefix} [${timestamp}] ${type.padEnd(7)}`),
      ...formattedArgs
    );
  };
}

// Export logger functions
module.exports = {
  info: createLogger('INFO'),
  success: createLogger('SUCCESS'),
  warn: createLogger('WARNING'),
  error: createLogger('ERROR'),
  debug: createLogger('DEBUG'),
  system: createLogger('SYSTEM'),
  git: createLogger('GIT'),
  file: createLogger('FILE'),
  truncate,
  formatValue
}; 