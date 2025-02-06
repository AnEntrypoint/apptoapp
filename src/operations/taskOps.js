const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
    console.log(`Created directory: ${dirname}`);
  }
}

// Configuration management
function loadProjectConfig(baseDir) {
  const configPath = path.join(baseDir, '.project-config.json');
  if (fs.existsSync(configPath)) {
    console.log(`Loading project config from: ${configPath}`);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  console.log(`No project config found. Using default configuration.`);
  return {
    framework: 'next',
    language: 'typescript',
    styling: 'tailwind',
    testing: 'jest',
    dependencies: {}
  };
}

function saveProjectConfig(baseDir, config) {
  const configPath = path.join(baseDir, '.project-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Saved project config to: ${configPath}`);
}

// Dynamic package management
function updatePackageJson(baseDir, updates) {
  const pkgPath = path.join(baseDir, 'package.json');
  let pkg = {};

  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    console.log(`Loaded package.json from: ${pkgPath}`);
  }

  // Deep merge updates
  pkg = {
    ...pkg,
    ...updates,
    dependencies: { ...pkg.dependencies, ...updates.dependencies },
    devDependencies: { ...pkg.devDependencies, ...updates.devDependencies }
  };

  ensureDirectoryExists(pkgPath);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`Updated package.json at: ${pkgPath}`);

  // Install dependencies
  try {
    process.chdir(baseDir);
    console.log(`Installing dependencies in: ${baseDir}`);
    execSync('npm install', { stdio: 'inherit' });
    process.chdir('..');
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    throw error;
  }
}

function executeOperation(task) {
  console.log(`Starting operation: ${task}`);
  const baseDir = 'test';
  const config = loadProjectConfig(baseDir);

  // Track completed tasks to prevent circular dependencies
  const completedTasks = new Set();

  try {
    // Skip if task already completed
    if (completedTasks.has(task)) {
      console.log(`Task already completed: ${task}`);
      return true;
    }

    // Core setup tasks - these should not be decomposed
    const coreSetupTasks = [
      'Setup Next.js environment',
      'Install dependencies',
      'Analyze project requirements'
    ];

    // Component tasks - these should be handled directly
    const componentTasks = [
      'Add navigation menu',
      'Add portfolio section',
      'Add gallery section',
      'Add artist bio',
      'Add contact form',
      'Add social media links'
    ];

    // If it's a core setup task or component task, handle directly
    if (coreSetupTasks.includes(task) || componentTasks.includes(task)) {
      console.log(`Executing core/component task: ${task}`);
      completedTasks.add(task);
      return true;
    }

    // For other tasks, decompose only if necessary and avoid circular dependencies
    if (task.includes('Implement core features')) {
      return [
        'Setup Next.js environment',
        'Install dependencies'
      ];
    }

    if (task.includes('Add responsive design')) {
      return [
        'Install styling dependencies',
        'Add responsive styles'
      ];
    }

    if (task.includes('Add unit tests')) {
      return [
        'Install testing dependencies',
        'Generate test files'
      ];
    }

    // Specific tasks for creating an artist portfolio
    if (task.includes('Create project structure for artist portfolio')) {
      const directories = [
        'app', 'components', 'public', 'styles', 'pages',
        'public/images', 'public/icons', 'public/fonts',
        'public/videos', 'public/audio', 'public/documents',
        'public/other'
      ];
      directories.forEach(dir => {
        ensureDirectoryExists(path.join(baseDir, dir));
      });
      console.log(`Created project structure for artist portfolio.`);
    }
  } catch (error) {
    console.error(`Error executing operation for task: ${task}`, error);
  }
}
