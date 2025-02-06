const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function generatePlan(instruction) {
  console.log("Generating plan based on instruction:", instruction);
  console.log("Analyzing existing codebase structure...");

  // Ensure the project structure exists
  if (!await ensureProjectStructure()) {
    throw new Error('Failed to set up project structure');
  }

  const plan = [
    // Add tasks based on instruction
  ];

  return plan;
}

async function writeFilesFromStr(text) {
  try {
    fs.writeFileSync('TODO.txt', text);
    console.log(`Wrote plan to TODO.txt file.`);
  } catch (error) {
    console.error("Error writing plan:", error);
    throw error;
  }
}

async function cycleTasks(testUrl, instruction, pollInterval = 30000) {
  if (!fs.existsSync('TODO.txt')) fs.writeFileSync('TODO.txt', '');
  if (!fs.existsSync('CHANGELOG.txt')) fs.writeFileSync('CHANGELOG.txt', '');

  console.log('\nStarting cyclic task evaluation...');
  while (true) {
    try {
      const tasks = readTodo();
      if (tasks.length === 0) {
        console.log('\nNo tasks in TODO.txt. Adding summary to CHANGELOG.txt...');
        break;
      }

      for (const task of tasks) {
        console.log(`\nProcessing task: ${task}`);
        await executeOperation(task);
        removeTask(task);
        appendChangelog(task, `Completed task: ${task}`);
      }

      await sleep(pollInterval);
    } catch (error) {
      console.error('Error in cycleTasks:', error);
      break;
    }
  }
}

function readTodo() {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = fs.readFileSync('TODO.txt', 'utf8');
      return data.split('\n').map(line => line.trim()).filter(line => line !== '');
    }
    return [];
  } catch (error) {
    console.error('Error reading TODO.txt:', error);
    return [];
  }
}

function removeTask(task) {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = fs.readFileSync('TODO.txt', 'utf8');
      const updatedData = data.split('\n').filter(line => line.trim() !== task).join('\n');
      fs.writeFileSync('TODO.txt', updatedData);
      console.log(`Removed task: ${task}`);
    }
  } catch (error) {
    console.error('Error removing task:', error);
  }
}

function appendChangelog(task, message) {
  try {
    const logEntry = `${new Date().toISOString()} - ${message} - Task: ${task}\n`;
    fs.appendFileSync('CHANGELOG.txt', logEntry);
    console.log(`Appended to CHANGELOG.txt: ${logEntry.trim()}`);
  } catch (error) {
    console.error('Error appending to CHANGELOG.txt:', error);
  }
}

async function ensureProjectStructure() {
  const baseDir = 'test';
  const { execSync } = require('child_process');

  try {
    // Create base directories
    const dirs = [
      '',
      'app',
      'components',
      'public',
      'styles',
      'tests',
      '__tests__'
    ];

    dirs.forEach(dir => {
      const dirPath = path.join(baseDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Create initial files
    const files = [
      { path: 'app/layout.tsx', content: `export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>{children}</body>
    </html>
  );
}` },
      { path: 'app/page.tsx', content: `export default function Page() {
  return <div>Hello, world!</div>;
}` },
      { path: 'styles/globals.css', content: `body {
  font-family: Arial, sans-serif;
}` },
      { path: 'package.json', content: `{
  "name": "artist-portfolio",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  }
}` },
      { path: 'next.config.js', content: `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
}` },
      { path: 'jest.config.js', content: `module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};` },
      { path: 'jest.setup.js', content: `import '@testing-library/jest-dom';` },
      { path: 'tailwind.config.js', content: `module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};` },
      { path: 'postcss.config.js', content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};` },
      { path: 'tsconfig.json', content: `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}` }
    ];

    files.forEach(file => {
      const filePath = path.join(baseDir, file.path);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, file.content);
      }
    });

    return true;
  } catch (error) {
    console.error('Error setting up project structure:', error);
    return false;
  }
}

async function executeOperation(task) {
  console.log(`Starting operation: ${task}`);
  const baseDir = 'test';

  try {
    // Project Setup tasks
    if (task.includes('Initialize Next.js project structure')) {
      const nextConfigPath = path.join(baseDir, 'next.config.js');
      ensureDirectoryExists(nextConfigPath);
      fs.writeFileSync(nextConfigPath, `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
};`);
    } else if (task.includes('Set up TypeScript configuration')) {
      const tsConfigPath = path.join(baseDir, 'tsconfig.json');
      ensureDirectoryExists(tsConfigPath);
      fs.writeFileSync(tsConfigPath, `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`);
    } else if (task.includes('Install required dependencies')) {
      process.chdir(baseDir);
      execSync('npm install', { stdio: 'inherit' });
      process.chdir('..');
    } else if (task.includes('Create basic component structure')) {
      const components = [
        { path: 'components/Nav.tsx', content: `export default function Nav() {
  return <nav>Navigation</nav>;
}` },
        { path: 'components/ContactForm.tsx', content: `export default function ContactForm() {
  return <form>Contact Form</form>;
}` },
        { path: 'components/Portfolio.tsx', content: `export default function Portfolio() {
  return <div>Portfolio</div>;
}` }
      ];

      components.forEach(component => {
        const componentPath = path.join(baseDir, component.path);
        ensureDirectoryExists(componentPath);
        fs.writeFileSync(componentPath, component.content);
      });
    }
  } catch (error) {
    console.error(`Error executing operation for task: ${task}`, error);
  }
}

function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
