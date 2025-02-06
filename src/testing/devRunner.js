const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

  try {
    // Check if Next.js is installed
    if (!fs.existsSync(path.join(baseDir, 'node_modules', 'next'))) {
      console.log('Installing Next.js dependencies...');
      process.chdir(baseDir);
      execSync('npm install', { stdio: 'inherit' });
      process.chdir('..');
    }

    // Create necessary Next.js files if they don't exist
    const requiredFiles = {
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
}`
    };

    Object.entries(requiredFiles).forEach(([file, content]) => {
      const fullPath = path.join(baseDir, file);
      if (!fs.existsSync(fullPath)) {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
      }
    });

    return true;
  } catch (error) {
    console.error('Error setting up Next.js:', error);
    return false;
  }
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
    const devProcess = spawn('npx', ['next', 'dev', '--port', port.toString()], {
      stdio: 'pipe',
      shell: true
    });

    // Wait for the server to be ready
    await new Promise((resolve, reject) => {
      let isReady = false;
      const timeout = setTimeout(() => {
        if (!isReady) {
          reject(new Error('Server startup timeout'));
        }
      }, 30000);

      devProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Server:', output);
        if (output.includes('Ready')) {
          isReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      devProcess.stderr.on('data', (data) => {
        console.log('Server Err:', data.toString());
      });

      devProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Now run pupdebug with the correct port
    console.log(`Executing CLI command: npx pupdebug http://localhost:${port}`);
    const pupdebugProcess = spawn('npx', ['pupdebug', `http://localhost:${port}`], {
      stdio: 'pipe',
      shell: true
    });

    pupdebugProcess.stdout.on('data', (data) => {
      console.log('Browser:', data.toString());
    });

    pupdebugProcess.stderr.on('data', (data) => {
      console.error('Browser Error:', data.toString());
    });

    // Give some time for monitoring
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Clean up processes
    devProcess.kill();
    pupdebugProcess.kill();
    process.chdir('..');

    return true;
  } catch (error) {
    console.error('Error running dev server:', error);
    process.chdir('..');
    return false;
  }
}

module.exports = { runDevAndPupdebug };
