const babel = require('@babel/core');

module.exports = {
  process(src, filename) {
    const result = babel.transformSync(src, {
      filename,
      presets: [
        ['@babel/preset-env', { 
          targets: { node: 'current' },
          modules: 'commonjs'
        }]
      ],
      plugins: ['@babel/plugin-transform-modules-commonjs']
    });

    return result ? result.code : src;
  }
}; 