const { main, cleanup } = require('../../src/index');

async function runTests() {
  try {
    await main();
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await cleanup();
  }
}

runTests();
