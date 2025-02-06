class AppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

class ConfigurationError extends AppError {
  constructor(message, details = {}) {
    super(message, 'CONFIGURATION_ERROR', details);
  }
}

class TaskError extends AppError {
  constructor(message, details = {}) {
    super(message, 'TASK_ERROR', details);
  }
}

class OpenAIError extends AppError {
  constructor(message, details = {}) {
    super(message, 'OPENAI_ERROR', details);
  }
}

class FileSystemError extends AppError {
  constructor(message, details = {}) {
    super(message, 'FILESYSTEM_ERROR', details);
  }
}

// Error handler middleware for async functions
const asyncErrorHandler = (fn) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'An unexpected error occurred',
        'INTERNAL_ERROR',
        { originalError: error.message }
      );
    }
  };
};

module.exports = {
  AppError,
  ValidationError,
  ConfigurationError,
  TaskError,
  OpenAIError,
  FileSystemError,
  asyncErrorHandler,
};
