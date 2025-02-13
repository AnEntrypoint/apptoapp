#!/usr/bin/env node

const { program } = require('commander');
const { cycleTasks } = require('./transform');

program
  .name('pupdebug')
  .description('CLI tool for automated debugging')
  .argument('<url>', 'The URL of the project to edit')
  .argument('<instruction>', 'The instruction to apply to the project')
  .action(async (url, instruction) => {
    try {
      console.log('Starting cycle of task evaluation using pupdebug on URL:', url);

      if (!url || !instruction) {
        throw new Error('Missing required arguments');
      }

      await cycleTasks(url, instruction);
      console.log('Task completed successfully');
    } catch (error) {
      console.error('Cycle encountered an error:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);