const winston = require('winston');
const path = require('path');

// Configure log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Create the logger
const logger = winston.createLogger({
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
    }),
  ],
});

// Add request tracking
let requestId = 0;
const getRequestId = () => ++requestId;

const logWithContext = (level, message, context = {}) => {
  logger.log({
    level,
    message,
    requestId: getRequestId(),
    ...context,
  });
};

module.exports = {
  error: (message, context) => logWithContext('error', message, context),
  warn: (message, context) => logWithContext('warn', message, context),
  info: (message, context) => logWithContext('info', message, context),
  debug: (message, context) => logWithContext('debug', message, context),
}; 