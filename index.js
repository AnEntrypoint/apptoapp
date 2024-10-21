#!/usr/bin/env node
const fs = require('fs');
const transformationLibrary = require('./transform');

const instarray = [...process.argv];
instarray.shift();
instarray.shift();
const transformationInstruction = instarray.join(' ');
console.log("Current directory:", __dirname);
async function main() {
  try {
    if (instarray[0] === 'rewrite') {
      const text = fs.readFileSync('transformed.out');
      transformationLibrary.writeFilesFromStr(text.toString());
    } else {
      const text = await transformationLibrary.generateJsonData(transformationInstruction);
      transformationLibrary.writeFilesFromStr(text);
    }
  } catch (error) {
    console.error('Error in CLI app:', error);
  }
}

main();
