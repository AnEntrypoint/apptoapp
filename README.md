# 🎉 Welcome to the AppToApp Transformer 🚀

Transform your code effortlessly with just a single command:

  npx apptoapp

Harness the power of CodeMistral 25 to convert, optimize, and enhance your application code with ease. This tool acts like a coding companion, ready to assist you in making your code better.

## 🌟 Overview

The AppToApp Transformer is a CLI tool designed to automate code transformations using advanced AI. It scans your project, generates a diff of its current state, and interacts with a CodeMistral 25-powered API to identify the necessary changes. After that, it applies those diffs to improve your codebase.

## 🛠️ Features

- **✨ Intelligent Code Transformations:** Leverage CodeMistral 25 to understand your project and provide actionable improvements.
- **🔄 Automated Diff Application:** Automatically generates diff patches and applies them to your project, streamlining the process.
- **💻 Command Line Interface:** Integrates smoothly into your workflow with a simple one-line command.
- **🚫 Customizable Ignoring:** Supports ignore patterns to exclude specific files or directories from processing, giving you control over what gets transformed. You can specify these patterns in a `.gitignore`-like format to tailor the transformation process to your needs.

## 🛠️ Custom Tool System

The tool system is customizable because it allows you to extend the functionality of the application by creating your own tools. Here's how it works:

### Tool Definition and Discovery:
- **Tool Files:** Tools are implemented as JavaScript files placed in either a tools directory within the project's root or within the same directory as tools.js.
- **JSDoc Metadata:** Each tool file should contain a JSDoc comment block at the beginning of the file. This JSDoc block is parsed to extract metadata about the tool, such as its name, description, and parameters.
- **Metadata Tags:** Specific JSDoc tags are used to define the tool's metadata:
  - `@tool`: Specifies the name of the tool. This name is used to identify and call the tool.
  - `@description`: Provides a brief description of what the tool does.
  - `@param`: Defines the parameters the tool accepts. For each parameter, you specify:
    - `type`: The data type of the parameter (e.g., string, number, boolean). This is extracted from the JSDoc type definition.
    - `description`: A description of the parameter's purpose.

### Automatic Loading:
The `loadTools` function in tools.js automatically scans the designated tools directories, reads the content of each .js file, parses the JSDoc comments, and extracts the tool metadata. This metadata is then used to build a list of available tools.

### Tool Implementation and Execution:
- **Implementation Function:** Each tool file must export a function that implements the tool's logic. This function is what gets executed when the tool is called.
- **Parameter Handling:** The `executeToolCall` function handles the execution of a tool. It retrieves the tool's implementation based on the `toolCall.function.name` and then calls the implementation function with the arguments provided in `toolCall.arguments`.
- **Dynamic Loading:** Tools are loaded dynamically at runtime when the `loadTools` function is called. This means you can add new tool files without needing to restart the application (although in the current setup, tools are loaded once at startup).

### Customization Process:
To create a custom tool, you would:
1. Create a new JavaScript file in the tools directory (or the directory containing tools.js).
2. Add a JSDoc comment block at the beginning of the file to define the tool's metadata using `@tool`, `@description`, and `@param` tags.
3. Implement the tool's logic in a function that is exported from the file. This function should accept parameters as defined in the JSDoc and return a result.

This design allows for a flexible and extensible tool system where users can easily add new functionalities by creating new tool files and defining their metadata through JSDoc comments.
