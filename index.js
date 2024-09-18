#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
  console.log('please set OPENAI_API_KEY in a .env or env var');
  process.exit();
}

const instarray = [...process.argv];
instarray.shift();
instarray.shift();
const transformationInstruction = instarray.join(' ');
const systemPrompt = `Only answer with complete set of modified files with all of their content, dont leave any part of any file out\nPerform the following modifications: ${transformationInstruction}\nRespond only in this format: filename.ext\n\`\`\`codetype\nfile contents\`\`\`\nfilename.ext\n\`\`\`codetype\nfile contents\`\`\`\n\nFor example:\n\nindex.js\n\`\`\`javascript\nalert("test")\`\`\`\ntest.js\n\`\`\`javascript\nsomething else\`\`\``;

console.trace();

async function generateJsonData() {
  try {
    const srcDirectory = './'; // Specify the source directory path
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const jsonEntries = {};
    const readSrcDirectory = async (srcDirectory) => {
      const files = fs.readdirSync(srcDirectory);
      await Promise.all(files.map(async filename => {
        const filePath = path.join(srcDirectory, filename);
        if (filePath.startsWith('node_modules') || filePath.startsWith('.')) {
          return; // Skip these files
        }
        if (fs.statSync(filePath).isDirectory()) {
          await readSrcDirectory(filePath);
        } else {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          jsonEntries[filePath] = fileContent;
        }
      }));
    };
    await readSrcDirectory(srcDirectory);
    const generatedJsonData = Object.keys(jsonEntries)
      .filter(fp => {
        filePath = fp
        return filePath.endsWith('.js') || filePath.endsWith('.gd') || filePath.endsWith('.html') || filePath.endsWith('.css')|| filePath.endsWith('.jsx')|| filePath.endsWith('.svelte')
      }) // Ensure valid file types only
      .map(a => {
        let filePath = a;
        let filetype='';
        if(filePath.endsWith('.js'))  filetype = 'javascript';
        if(filePath.endsWith('.gd'))  filetype = 'gdscript';
        if(filePath.endsWith('.html'))  filetype = 'html';
        if(filePath.endsWith('.jsx'))  filetype = 'javascript';
        if(filePath.endsWith('.svelte'))  filetype = 'svelte';
        const content = jsonEntries[a].trim();
        return `${path.basename(a)}\n\`\`\`${filetype}\n${content}\n\`\`\``;
      })
      .join('\n'); // Use simple filenames and newlines

    const messages = [
      { "role": "system", "content": systemPrompt },
      { "role": "user", "content": `${generatedJsonData}+\n\n+${transformationInstruction}` },
    ];
    const tosend = {
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 16384,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    }
    const response = await openai.chat.completions.create(tosend);
    fs.writeFileSync('sent.json', JSON.stringify(tosend))
    if (response.choices[0].finish_reason === 'length') {
      console.log("BAILING OUT BECAUSE FINISH REASON IS LENGTH, PLEASE USE A BIGGER MODEL");
      return;
    }

    const text = response.choices[0].message.content.trim();
    console.log('Generated Output:', text); // Dump of generated output
    fs.writeFileSync('transformed.out', text);
    return text;
  } catch (error) {
    console.trace(error);
    console.error('Error:', error);
  }
}

// Function to write files from string response
function writeFilesFromStr(str) {
  let matches;
  const codeBlocks = [];
  const codeBlockRegex = /^(.*?)(\s*```([\s\S]*?)```)/gm;

  while ((matches = codeBlockRegex.exec(str)) !== null) {
    const name = matches[1] ? matches[1].trim() : "unknown"; // Default name if undefined
    const fileContent = matches[2] ? matches[2].trim() : "";
    if (fileContent) {
      codeBlocks.push({ name, file: fileContent });
    }
  }

  codeBlocks.forEach(({ name, file }) => {
    if (!file.trim()) return;
    const parts = file.split('\n').filter(a => a != '');
    if (name !== 'unknown') {
      parts.shift();
      parts.pop();
    } else {
      parts.shift();
      name = parts.shift();
      parts.pop();
    }
    const fileContent = parts.join('\n').trim();
    if (name && fileContent) {
      console.log(`Writing File: ${name.replace('#','').replace('//','').trim()}`); // Trace the writing process
      writeFile(name.replace('#','').replace('//','').trim(), fileContent);
    }
  });

  function writeFile(filePath, content) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

if (instarray[0] === 'rewrite') {
  const text = fs.readFileSync('transformed.out');
  writeFilesFromStr(text.toString());
} else {
  generateJsonData().then(text => {
    writeFilesFromStr(text);
  });
}
