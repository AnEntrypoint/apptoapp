const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const treeKill = require('tree-kill');

let devProcess = null;
let pupdebugProcess = null;

function findAvailablePort(startPort) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

async function ensureNextSetup() {
  const baseDir = 'test';
  const currentDir = process.cwd();

  try {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    // Change to test directory
    process.chdir(baseDir);

    // Initialize package.json with proper Next.js configuration
    console.log('Initializing package.json...');
    const packageJson = {
      name: "artist-portfolio",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        test: "jest",
        lint: "next lint"
      },
      dependencies: {
        "next": "14.1.0",
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@types/node": "^20.11.16",
        "@types/react": "^18.2.52",
        "@types/react-dom": "^18.2.18",
        "typescript": "^5.3.3",
        "jest": "^29.7.0",
        "@testing-library/react": "^14.2.1",
        "@testing-library/jest-dom": "^6.4.2",
        "tailwindcss": "^3.4.1",
        "postcss": "^8.4.33",
        "autoprefixer": "^10.4.17"
      }
    };
    
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
      
    // Install dependencies
    console.log('Installing Next.js dependencies...');
    execSync('npm install', { stdio: 'inherit' });

    // Create necessary Next.js files and directories
    const dirs = [
      'app',
      'components',
      'public',
      'styles',
      '__tests__'
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    const requiredFiles = {
      'app/page.tsx': `import { Hero } from '@/components/Hero';
import { Portfolio } from '@/components/Portfolio';
import { Nav } from '@/components/Nav';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />
      <Hero />
      <Portfolio />
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
      'components/Nav.tsx': `export function Nav() {
  return (
    <nav className="fixed top-0 w-full bg-white shadow-md z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Artist Portfolio</h1>
          <div className="hidden md:flex space-x-6">
            <a href="#home" className="hover:text-gray-600">Home</a>
            <a href="#portfolio" className="hover:text-gray-600">Portfolio</a>
            <a href="#about" className="hover:text-gray-600">About</a>
            <a href="#contact" className="hover:text-gray-600">Contact</a>
          </div>
        </div>
      </div>
    </nav>
  );
}`,
      'components/Hero.tsx': `export function Hero() {
  return (
    <section id="home" className="pt-20 min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500">
      <div className="text-center text-white">
        <h1 className="text-5xl md:text-7xl font-bold mb-4">Welcome to My Portfolio</h1>
        <p className="text-xl md:text-2xl mb-8">Exploring the boundaries of artistic expression</p>
        <a href="#portfolio" className="bg-white text-purple-500 px-8 py-3 rounded-full font-semibold hover:bg-opacity-90 transition-all">
          View My Work
        </a>
      </div>
    </section>
  );
}`,
      'components/Portfolio.tsx': `export function Portfolio() {
  return (
    <section id="portfolio" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-12">My Portfolio</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Portfolio items will be added here */}
        </div>
      </div>
    </section>
  );
}`,
      'jest.config.js': `const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
  },
}

module.exports = createJestConfig(customJestConfig)`,
      'jest.setup.js': `import '@testing-library/jest-dom'`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
      'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    };

    Object.entries(requiredFiles).forEach(([file, content]) => {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, content);
    });

    // Return to original directory
    process.chdir(currentDir);
    return true;
  } catch (error) {
    console.error('Error setting up Next.js:', error);
    // Always ensure we return to the original directory
    if (process.cwd() !== currentDir) {
      process.chdir(currentDir);
    }
    return false;
  }
}

function cleanup() {
  return new Promise((resolve) => {
    console.log('Cleaning up processes...');
    
    const cleanupTasks = [];
    
    if (devProcess) {
      cleanupTasks.push(new Promise((res) => {
        treeKill(devProcess.pid, 'SIGTERM', (err) => {
          if (err) console.log('Dev process already terminated');
          res();
        });
      }));
    }
    
    if (pupdebugProcess) {
      cleanupTasks.push(new Promise((res) => {
        treeKill(pupdebugProcess.pid, 'SIGTERM', (err) => {
          if (err) console.log('Pupdebug process already terminated');
          res();
        });
      }));
    }
    
    Promise.all(cleanupTasks).then(resolve);
  });
}

async function runDevAndPupdebug(testUrl, shouldRecordLogs) {
  console.log('Starting dev server and monitoring...');

  try {
    // Ensure Next.js is set up
    if (!await ensureNextSetup()) {
      console.error('Failed to set up Next.js environment');
      return false;
    }

    // Find an available port
    const port = await findAvailablePort(3000);
    console.log(`Using port ${port} for Next.js server`);

    // Start the Next.js dev server
    console.log('Starting server with npm run dev...');
    process.chdir('test');
    
    // Kill any existing processes first
    await cleanup();
    
    // Start dev server with npm
    devProcess = spawn('npm.cmd', ['run', 'dev', '--', '--port', port.toString()], {
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        NODE_ENV: 'development'
      }
    });

    // Wait for the server to be ready
    await new Promise((resolve, reject) => {
      let isReady = false;
      let output = '';
      const timeout = setTimeout(() => {
        if (!isReady) {
          cleanup().then(() => {
            reject(new Error('Server startup timeout'));
          });
        }
      }, 60000); // Reduced timeout to 60 seconds

      devProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log('Server:', chunk);
        if (chunk.includes('Ready') || output.includes('Ready') || 
            chunk.includes('started server') || output.includes('started server')) {
          isReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      devProcess.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString());
      });

      devProcess.on('error', (error) => {
        clearTimeout(timeout);
        cleanup().then(() => {
          reject(error);
        });
      });

      devProcess.on('exit', (code) => {
        if (!isReady) {
          clearTimeout(timeout);
          cleanup().then(() => {
            reject(new Error(`Server exited with code ${code}`));
          });
        }
      });
    });

    // Give the server a moment to stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));

    return true;
  } catch (error) {
    console.error('Error running dev server:', error);
    await cleanup();
    process.chdir('..');
    return false;
  }
}

// Ensure cleanup on process exit
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

module.exports = { runDevAndPupdebug };
