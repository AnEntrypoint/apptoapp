#!/usr/bin/env node

const { executeCommand } = require('./utils');

async function main() {
  console.log('Starting apptoapp...');
  
  try {
    const args = process.argv.slice(2);
    const command = args.join(' ');
    
    console.log('Received command:', command);
    
    // Add your main application logic here
    // For now, let's just echo the command
    const result = await executeCommand(`echo ${command}`);
    
    console.log('Command output:', result.stdout);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error); 