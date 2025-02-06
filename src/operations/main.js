const { generatePlan, writeFilesFromStr, cycleTasks } = require('./taskOps');
const { ensureProjectStructure } = require('./fileOps');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

async function main() {
  try {
    logger.info('Starting application transformation process');
    const instruction = process.argv[2] || 'make this a comprehensive artist portfolio site';

    // Ensure the project structure exists
    if (!await ensureProjectStructure()) {
      throw new Error('Failed to set up project structure');
    }

    // Generate plan based on instruction
    const plan = await generatePlan(instruction);
    logger.info('Generated Plan:', plan);

    // Write files from plan
    await writeFilesFromStr(plan);

    // Start cyclic task evaluation
    await cycleTasks('http://localhost:3000', instruction);

  } catch (error) {
    logger.error('Error in main process', { error: error.message });
  }
}

module.exports = main;
