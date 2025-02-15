const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/index.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
  externals: {
    'fs': 'commonjs fs',
    'path': 'commonjs path',
    'os': 'commonjs os',
    'crypto': 'commonjs crypto',
    'stream': 'commonjs stream',
    'util': 'commonjs util',
    'child_process': 'commonjs child_process'
  },
  node: {
    __dirname: false,
    __filename: false,
  }
}; 