function needsDecomposition(task) {
  // Only decompose high-level tasks that haven't been decomposed yet
  const highLevelIndicators = [
    'create', 'implement', 'setup', 'build', 'add', 'integrate',
    'design', 'develop', 'configure', 'optimize', 'test'
  ];
  
  // Don't decompose if task is already specific enough
  const specificIndicators = [
    'analyze', 'install', 'copy', 'write', 'generate',
    'validate', 'verify', 'check', 'run', 'execute',
    'style', 'link', 'grid', 'filter', 'form'
  ];

  const taskLower = task.toLowerCase();
  
  // Prevent decomposition of already decomposed tasks
  if (taskLower.includes('component') && 
      (taskLower.includes('generate') || taskLower.includes('create'))) {
    return false;
  }

  return highLevelIndicators.some(indicator => taskLower.includes(indicator)) &&
         !specificIndicators.some(indicator => taskLower.includes(indicator)) &&
         !task.includes('(') && 
         !task.includes('{') && 
         !task.includes('function') &&
         !task.includes('npm');
}

function decomposeTask(task) {
  console.log(`Decomposing task: ${task}`);
  const taskLower = task.toLowerCase();

  // Project structure tasks - this should be first
  if (taskLower.includes('create project') || taskLower.includes('structure')) {
    return [
      'Install required dependencies',
      'Setup Next.js environment',
      'Generate base components'
    ];
  }

  // Core features tasks
  if (taskLower.includes('core') || taskLower.includes('implement')) {
    return [
      'Generate page layout',
      'Setup routing',
      'Add global styles'
    ];
  }

  // Navigation tasks
  if (taskLower.includes('navigation') || taskLower.includes('menu')) {
    return [
      'Generate navigation component',
      'Add mobile menu styles',
      'Add navigation links'
    ];
  }

  // Portfolio tasks
  if (taskLower.includes('portfolio') || taskLower.includes('gallery')) {
    return [
      'Generate portfolio component',
      'Add image grid styles',
      'Add filtering functionality'
    ];
  }

  // Contact form tasks
  if (taskLower.includes('contact') || taskLower.includes('form')) {
    return [
      'Generate contact component',
      'Add form validation',
      'Add form submission'
    ];
  }

  // Testing tasks
  if (taskLower.includes('test')) {
    return [
      'Install testing dependencies',
      'Generate test files',
      'Run test suite'
    ];
  }

  // Design tasks
  if (taskLower.includes('design') || taskLower.includes('style')) {
    return [
      'Install styling dependencies',
      'Generate style files',
      'Add responsive styles'
    ];
  }

  // Default implementation tasks
  return [
    'Generate component files',
    'Add core functionality',
    'Add error handling'
  ];
}

module.exports = { needsDecomposition, decomposeTask };
