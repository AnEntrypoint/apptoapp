function needsDecomposition(task) {
  // Check if this is a high-level task that needs breaking down
  return task.startsWith('1.') ||
         task.startsWith('2.') ||
         task.startsWith('3.') ||
         task.startsWith('4.') ||
         task.startsWith('5.') ||
         task.startsWith('6.') ||
         task.startsWith('7.');
}

function decomposeTask(task) {
  console.log(`Decomposing task: ${task}`);

  // Define decomposition rules for each major category
  const decompositionRules = {
    '1. Project Setup': [
      'Initialize Next.js project structure',
      'Set up TypeScript configuration',
      'Install required dependencies',
      'Create basic component structure'
    ],
    '2. Core Components': [
      'Create Hero component with responsive design',
      'Implement Portfolio Grid with image optimization',
      'Add artwork filtering functionality',
      'Create artwork detail modal component',
      'Implement About section with markdown support',
      'Build contact form with validation'
    ],
    '3. Navigation': [
      'Create responsive navigation component',
      'Implement mobile menu functionality',
      'Add smooth scroll behavior',
      'Create footer with social links'
    ],
    '4. Styling': [
      'Set up Tailwind CSS configuration',
      'Create global styles and theme',
      'Implement responsive breakpoints',
      'Add loading animations'
    ],
    '5. Content Management': [
      'Create artwork data model',
      'Implement image upload functionality',
      'Add artwork metadata handling',
      'Set up content preview system'
    ],
    '6. Testing': [
      'Set up Jest and React Testing Library',
      'Write component unit tests',
      'Add integration tests',
      'Implement performance testing'
    ],
    '7. Documentation': [
      'Write component documentation',
      'Create setup guide',
      'Add content management instructions'
    ]
  };

  // Find matching category
  const category = Object.keys(decompositionRules).find(key => task.includes(key));
  if (category) {
    console.log(`Found matching category: ${category}`);
    return decompositionRules[category];
  }

  console.log('No decomposition rule found for this task');
  return [];
}

module.exports = { needsDecomposition, decomposeTask };
