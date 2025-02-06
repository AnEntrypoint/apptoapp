const fs = require('fs');
const path = require('path');
const sleep = require('../utils/sleep');
const { runDevAndPupdebug } = require('../testing/devRunner');
const { updateUnitTests, runUnitTests } = require('../testing/unitTests');
const { readTodo, removeTask, appendChangelog } = require('./fileOps');
const { executeOperation, determineTaskCompletion } = require('./taskOps');
const { needsDecomposition, decomposeTask } = require('./taskDecomposition');

async function ensureProjectStructure() {
  const baseDir = 'test';
  const { execSync } = require('child_process');
  
  try {
    // Create base directories
    const dirs = [
      '',
      'app',
      'components',
      'styles',
      '__tests__',
      'public'
    ];

    dirs.forEach(dir => {
      const fullPath = path.join(baseDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`Created directory: ${fullPath}`);
      }
    });

    // Create initial configuration files
    const configFiles = {
      'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
};

module.exports = nextConfig;`,
      'package.json': JSON.stringify({
        name: "artist-portfolio",
        version: "0.1.0",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          test: "jest --passWithNoTests",
          lint: "next lint"
        },
        dependencies: {
          next: "14.1.0",
          react: "^18",
          "react-dom": "^18",
          "@heroicons/react": "^2.0.18",
          "framer-motion": "^10.16.4"
        },
        devDependencies: {
          "@testing-library/jest-dom": "^6.1.4",
          "@testing-library/react": "^14.0.0",
          "@types/node": "^20",
          "@types/react": "^18",
          "@types/react-dom": "^18",
          "autoprefixer": "^10.0.1",
          "eslint": "^8",
          "eslint-config-next": "14.1.0",
          "jest": "^29.7.0",
          "jest-environment-jsdom": "^29.7.0",
          "postcss": "^8",
          "tailwindcss": "^3.3.0",
          "typescript": "^5"
        }
      }, null, 2),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: "es5",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "node",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] }
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"]
      }, null, 2),
      'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5',
        secondary: '#10B981',
      },
    },
  },
  plugins: [],
}`,
      'app/page.tsx': `export default function Home() {
  return (
    <main className="min-h-screen">
      <h1>Artist Portfolio</h1>
    </main>
  );
}`,
      'app/layout.tsx': `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Artist Portfolio',
  description: 'A comprehensive portfolio showcasing artistic work',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}`,
      'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}`,
      'jest.config.js': `const nextJest = require('next/jest')
 
const createJestConfig = nextJest({
  dir: './',
})
 
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
}
 
module.exports = createJestConfig(customJestConfig)`,
      'jest.setup.js': `import '@testing-library/jest-dom'`
    };

    let needsNpmInstall = false;

    Object.entries(configFiles).forEach(([file, content]) => {
      const fullPath = path.join(baseDir, file);
      if (!fs.existsSync(fullPath)) {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
        console.log(`Created file: ${fullPath}`);
        if (file === 'package.json') {
          needsNpmInstall = true;
        }
      }
    });

    // Install dependencies if needed
    if (needsNpmInstall) {
      console.log('\nInstalling dependencies...');
      const currentDir = process.cwd();
      process.chdir(baseDir);
      try {
        // First install core dependencies
        execSync('npm install', { stdio: 'inherit' });
        
        // Then explicitly install postcss-related packages
        execSync('npm install -D postcss@latest autoprefixer@latest tailwindcss@latest', { stdio: 'inherit' });
        
        console.log('Dependencies installed successfully\n');
      } catch (error) {
        console.error('Error installing dependencies:', error);
        throw error;
      } finally {
        process.chdir(currentDir);
      }
    }

    return true;
  } catch (error) {
    console.error('Error in project setup:', error);
    return false;
  }
}

async function generatePlan(instruction) {
  console.log("Generating plan based on instruction:", instruction);
  console.log("Analyzing existing codebase structure...");
  
  // Ensure the project structure exists
  if (!await ensureProjectStructure()) {
    throw new Error('Failed to set up project structure');
  }
  
  const plan = [
    "1. Project Setup and Analysis:",
    "  - Analyze existing Next.js structure",
    "  - Review current components and pages",
    "  - Create list of required dependencies",
    "",
    "2. Core Components Development:",
    "  - Hero Section with artist introduction",
    "  - Portfolio Grid/Gallery component",
    "    * Image optimization and lazy loading",
    "    * Filtering capability by art category",
    "    * Modal view for artwork details",
    "  - About/Bio section with artist statement",
    "  - Contact form with validation",
    "",
    "3. Navigation and Layout:",
    "  - Responsive navigation menu",
    "  - Footer with social links",
    "  - Layout component with consistent styling",
    "",
    "4. Styling and UI:",
    "  - Define color scheme and typography",
    "  - Implement responsive design breakpoints",
    "  - Add animations and transitions",
    "  - Ensure accessibility compliance",
    "",
    "5. Content Management:",
    "  - Create artwork data structure",
    "  - Implement image upload/management",
    "  - Add metadata handling for artworks",
    "",
    "6. Testing and Optimization:",
    "  - Unit tests for all components",
    "  - Integration tests for forms",
    "  - Performance optimization",
    "  - SEO implementation",
    "",
    "7. Documentation:",
    "  - Code documentation",
    "  - Setup instructions",
    "  - Content management guide"
  ];

  return plan.join('\n');
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
        const summary = `Summary: Completed all tasks based on instruction "${instruction}".`;
        appendChangelog(summary, 'Summary');
        await sleep(pollInterval);
        continue;
      }

      let needsServerRun = false;
      for (const task of tasks) {
        console.log(`\nEvaluating task: ${task}`);
        if (needsDecomposition(task)) {
          console.log(`Task requires decomposition: ${task}`);
          const subTasks = decomposeTask(task);
          if (subTasks.length > 0) {
            console.log('Decomposed into sub-tasks:');
            subTasks.forEach(subTask => console.log(`  - ${subTask}`));
            removeTask(task);
            fs.appendFileSync('TODO.txt', subTasks.map(t => `  ${t}`).join('\n') + '\n');
            continue;
          }
        }

        console.log(`Checking if task is completed: ${task}`);
        if (determineTaskCompletion(task)) {
          console.log(`Task is completed: ${task}`);
          executeOperation(task);
          appendChangelog(task, `Operation executed successfully`);
          removeTask(task);
        } else {
          console.log(`Task is not completed: ${task}`);
          needsServerRun = true;
        }
      }

      if (needsServerRun) {
        console.log('\nRunning dev server and pupdebug...');
        const shouldRecordLogs = true;
        const success = await runDevAndPupdebug(testUrl, shouldRecordLogs);
        
        if (success) {
          console.log('\nDev server and pupdebug completed. Updating unit tests...');
          await updateUnitTests(instruction);

          if (!await runUnitTests()) {
            console.log("\nUnit tests failed. Skipping this cycle.");
            await sleep(pollInterval);
            continue;
          }
        } else {
          console.log('\nDev server or pupdebug failed. Skipping this cycle.');
          await sleep(pollInterval);
          continue;
        }
      }

      await sleep(pollInterval);
    } catch (error) {
      console.error('\nCycle error:', error);
      await sleep(pollInterval);
    }
  }
}

module.exports = { cycleTasks, generatePlan, writeFilesFromStr };