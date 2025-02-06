#!/usr/bin/env node

const path = require('path');

if (path.basename(process.cwd()) !== 'test') {
  console.error('Please run this script from the ./test directory.');
  process.exit(1);
}

require('../src/index');
