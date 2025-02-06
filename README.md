# AppToApp Transformer

A powerful application transformation tool that uses GPT to convert and improve applications.

## Features

- Automated application transformation using GPT
- Task-based operation system
- Robust error handling and logging
- Configurable settings via environment variables
- Comprehensive testing suite
- Code quality enforcement with ESLint

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- OpenAI API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/apptoapp.git
cd apptoapp
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example file and configure your settings:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your configuration values, especially the `OPENAI_API_KEY`.

## Usage

### Basic Usage

```bash
npm start
```

### Development Mode

```bash
npm run dev
```

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix  # Auto-fix linting issues
```

## Project Structure

```
apptoapp/
├── src/
│   ├── config/         # Configuration management
│   ├── operations/     # Core transformation operations
│   ├── testing/        # Testing utilities
│   └── utils/          # Utility functions
├── test/              # Test files
├── .env.example       # Environment variables template
├── .eslintrc.js      # ESLint configuration
└── package.json       # Project metadata and dependencies
```

## Configuration

The application can be configured using environment variables. See `.env.example` for available options.

## Error Handling

The application uses a custom error handling system with specific error types:
- ValidationError
- ConfigurationError
- TaskError
- OpenAIError
- FileSystemError

## Logging

Logging is handled by Winston and can be configured via environment variables:
- LOG_LEVEL: debug, info, warn, error
- Logs are stored in the `logs/` directory

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the GPT API
- Contributors and maintainers 