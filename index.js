#!/usr/bin/env node

const path = require('path');
const { cycleTasks } = require('./transform');

if (path.basename(process.cwd()) !== 'test') {
  console.error('Please run this script from the ./test directory.');
  process.exit(1);
}

const testUrl = 'http://localhost:3000';
const instruction = 'make this a comprehensive artist portfolio site';

console.log('Starting cycle of task evaluation using pupdebug on URL:', testUrl);
cycleTasks(testUrl, instruction).catch(error => {
  console.error('Cycle encountered an error:', error);
});
