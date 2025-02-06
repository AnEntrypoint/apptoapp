#!/usr/bin/env node

const { program } = require('commander');
const { cycleTasks } = require('./transform');

program
  .version('0.0.2')
  .description('A CLI tool that edits other projects')
  .argument('<url>', 'The URL of the project to edit')
  .argument('<instruction>', 'The instruction to apply to the project')
  .action((url, instruction) => {
    console.log('Starting cycle of task evaluation using pupdebug on URL:', url);
    cycleTasks(url, instruction).catch(error => {
      console.error('Cycle encountered an error:', error);
    });
  });

program.parse(process.argv);
