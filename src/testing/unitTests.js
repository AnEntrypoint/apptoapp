const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function ensureTestDirectory() {
  const testDir = path.join('test', '__tests__');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  return testDir;
}

async function updateUnitTests(instruction) {
  console.log('Updating unit tests based on current components...');
  const testDir = ensureTestDirectory();

  try {
    // Create test setup file
    const setupPath = path.join('test', 'jest.setup.js');
    fs.writeFileSync(setupPath, `import '@testing-library/jest-dom';`);

    // Create Jest config
    const jestConfigPath = path.join('test', 'jest.config.js');
    fs.writeFileSync(jestConfigPath, `const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
};

module.exports = createJestConfig(customJestConfig);`);

    // Generate component tests
    const componentsDir = path.join('test', 'components');
    if (fs.existsSync(componentsDir)) {
      const components = fs.readdirSync(componentsDir);

      for (const component of components) {
        if (component.endsWith('.tsx')) {
          const componentName = component.replace('.tsx', '');
          const testPath = path.join(testDir, `${componentName}.test.tsx`);

          console.log(`Generating test for ${componentName}...`);

          // Read component file to analyze its structure
          const componentContent = fs.readFileSync(path.join(componentsDir, component), 'utf8');

          // Generate appropriate tests based on component content
          let testContent = `import { render, screen } from '@testing-library/react';
import ${componentName} from '../components/${component}';

describe('${componentName}', () => {

  if (componentContent.includes('motion.')) {
    testContent += \`
  it('renders with animation properties', () => {
    render(<${componentName} />);
    const element = screen.getByRole('region');
    expect(element).toBeInTheDocument();
    expect(element).toHaveStyle('opacity: 1');
  });
\`;
  }

  if (componentContent.includes('form')) {
    testContent += \`
  it('renders form elements correctly', () => {
    render(<${componentName} />);
    const form = screen.getByRole('form');
    expect(form).toBeInTheDocument();
    // Add more specific form element tests
  });
\`;
  }

  if (componentContent.includes('nav')) {
    testContent += \`
  it('renders navigation links', () => {
    render(<${componentName} />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    // Add tests for specific navigation items
  });
\`;
  }

  testContent += \`
});
\`;

          fs.writeFileSync(testPath, testContent);
          console.log(`Created test file: ${testPath}`);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Error updating unit tests:', error);
    return false;
  }
}

async function runUnitTests() {
  console.log('Running unit tests...');
  try {
    // First ensure we're in the test directory
    process.chdir('test');

    // Run npm test with proper environment variables
    execSync('npx jest --passWithNoTests', {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_TELEMETRY_DISABLED: '1'
      }
    });

    // Change back to original directory
    process.chdir('..');
    return true;
  } catch (error) {
    console.error('Unit tests failed:', error);
    // Make sure we change back to original directory even if tests fail
    try {
      process.chdir('..');
    } catch (e) {
      // Ignore directory change error
    }
    return false;
  }
}

module.exports = { updateUnitTests, runUnitTests };
