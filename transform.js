const { cycleTasks, generateJsonData, writeFilesFromStr } = require('./src/operations/main');

// When executed directly, take the test URL from the command-line arguments and start the cycle.
if (require.main === module) {
  const testUrl = process.argv[2];
  const instruction = process.argv[3] || "";
  if (!testUrl) {
    console.error('Please provide a test URL as an argument. Example:');
    console.error('  node transform.js http://localhost:3000 "make this a comprehensive artist portfolio site"');
    process.exit(1);
  }
  console.log('Starting cycle of task evaluation using pupdebug on URL:', testUrl);
  cycleTasks(testUrl, instruction).catch(error => {
    console.error('Cycle encountered an error:', error);
  });
}

module.exports = { cycleTasks, generateJsonData, writeFilesFromStr }; 