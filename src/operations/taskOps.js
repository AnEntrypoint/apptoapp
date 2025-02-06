const fs = require('fs');
const path = require('path');

function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

function executeOperation(task) {
  console.log(`Starting operation: ${task}`);
  const baseDir = 'test';

  try {
    // Project Setup tasks
    if (task.includes('Initialize Next.js project structure')) {
      const nextConfigPath = path.join(baseDir, 'next.config.js');
      ensureDirectoryExists(nextConfigPath);
      fs.writeFileSync(nextConfigPath, `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
};

module.exports = nextConfig;`);
      console.log('Created Next.js config');
    }

    if (task.includes('Set up TypeScript configuration')) {
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
}`);
      console.log('Created TypeScript config');
    }

    if (task.includes('Install required dependencies')) {
      const packagePath = path.join(baseDir, 'package.json');
      ensureDirectoryExists(packagePath);
      fs.writeFileSync(packagePath, `{
  "name": "artist-portfolio",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.1.0",
    "react": "^18",
    "react-dom": "^18",
    "@heroicons/react": "^2.0.18",
    "framer-motion": "^10.16.4",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.31"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.1.4",
    "@testing-library/react": "^14.0.0",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "eslint": "^8",
    "eslint-config-next": "14.1.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5"
  }
}`);
      console.log('Created package.json with dependencies');
    }

    // Component tasks
    if (task.includes('Create Hero component')) {
      const heroPath = path.join(baseDir, 'components', 'Hero.tsx');
      ensureDirectoryExists(heroPath);
      fs.writeFileSync(heroPath, `import { motion } from 'framer-motion';

export default function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500"
    >
      <div className="text-center text-white">
        <motion.h1
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className="text-6xl font-bold mb-4"
        >
          Artist Name
        </motion.h1>
        <motion.p
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className="text-xl"
        >
          Transforming imagination into reality
        </motion.p>
      </div>
    </motion.section>
  );
}`);
      console.log('Created Hero component');
    }

    // Add more operation implementations...

    console.log(`Completed operation: ${task}`);
  } catch (error) {
    console.error(`Error executing operation: ${task}`, error);
    throw error;
  }
}

function determineTaskCompletion(task) {
  console.log(`Checking completion criteria for task: ${task}`);

  try {
    // Project Setup and Analysis checks
    if (task.includes('Analyze existing Next.js structure')) {
      const hasNextConfig = fs.existsSync(path.join('test', 'next.config.js'));
      const hasPackageJson = fs.existsSync(path.join('test', 'package.json'));
      console.log(`Next.js structure validation - Config: ${hasNextConfig}, Package: ${hasPackageJson}`);
      return hasNextConfig && hasPackageJson;
    }

    if (task.includes('Review current components')) {
      const hasComponents = fs.existsSync(path.join('test', 'components'));
      const hasPages = fs.existsSync(path.join('test', 'app'));
      console.log(`Component structure validation - Components dir: ${hasComponents}, Pages: ${hasPages}`);
      return hasComponents && hasPages;
    }

    if (task.includes('Create list of required dependencies')) {
      if (!fs.existsSync(path.join('test', 'package.json'))) return false;
      const pkg = JSON.parse(fs.readFileSync(path.join('test', 'package.json'), 'utf8'));
      const hasNextDep = pkg.dependencies && pkg.dependencies.next;
      const hasReactDep = pkg.dependencies && pkg.dependencies.react;
      console.log(`Dependencies validation - Next.js: ${hasNextDep}, React: ${hasReactDep}`);
      return hasNextDep && hasReactDep;
    }

    // Component checks
    if (task.includes('Portfolio Grid') || task.includes('Gallery component')) {
      const portfolioPath = path.join('test', 'components', 'Portfolio.tsx');
      if (!fs.existsSync(portfolioPath)) return false;
      const content = fs.readFileSync(portfolioPath, 'utf8');
      const hasImageHandling = content.includes('Image') || content.includes('img');
      const hasFiltering = content.includes('filter') || content.includes('category');
      console.log(`Portfolio validation - Has images: ${hasImageHandling}, Has filtering: ${hasFiltering}`);
      return hasImageHandling && hasFiltering;
    }

    // Navigation checks
    if (task.includes('navigation menu')) {
      const navPath = path.join('test', 'components', 'Nav.tsx');
      if (!fs.existsSync(navPath)) return false;
      const content = fs.readFileSync(navPath, 'utf8');
      const hasLinks = content.includes('Link') || content.includes('href');
      const hasResponsive = content.includes('media') || content.includes('@media');
      console.log(`Navigation validation - Has links: ${hasLinks}, Is responsive: ${hasResponsive}`);
      return hasLinks && hasResponsive;
    }

    // Testing checks
    if (task.includes('test')) {
      const testsExist = fs.existsSync(path.join('test', '__tests__'));
      if (!testsExist) return false;
      // Additional test validation could be added here
      return true;
    }

    // Default to false for unrecognized tasks
    console.log('No specific validation criteria found for this task');
    return false;
  } catch (error) {
    console.error('Error checking task completion:', error);
    return false;
  }
}

module.exports = { executeOperation, determineTaskCompletion };