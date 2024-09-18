const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const OpenAI = require("openai");

dotenv.config();

const transformationLibrary = {
  debug: process.env.debug || false,

  generateJsonData: async function(transformationInstruction) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('Please set OPENAI_API_KEY in a .env or env var');
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const srcDirectory = './';
      const jsonEntries = await this.readSrcDirectory(srcDirectory);
      const generatedJsonData = this.formatJsonData(jsonEntries);

      const systemPrompt = `Only answer with complete set of modified files with all of their content, dont leave any part of any file out\nAlways leave out unedited files\nPerform the following modifications: ${transformationInstruction}\nRespond only in this format: filename.ext\n\`\`\`codetype\nfile contents\`\`\`\nfilename.ext\n\`\`\`codetype\nfile contents\`\`\`\n\nFor example:\n\nindex.js\n\`\`\`javascript\nalert("test")\`\`\`\ntest.js\n\`\`\`javascript\nsomething else\`\`\``;

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
      };

      const response = await openai.chat.completions.create(tosend);

      if (this.debug) fs.writeFileSync('sent.json', JSON.stringify(tosend));

      if (response.choices[0].finish_reason === 'length') {
        throw new Error("BAILING OUT BECAUSE FINISH REASON IS LENGTH, PLEASE USE A BIGGER MODEL");
      }

      const text = response.choices[0].message.content.trim();
      if (this.debug) fs.writeFileSync('transformed.out', text);

      return text;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  },

  readSrcDirectory: async function(srcDirectory) {
    const jsonEntries = {};
    const files = fs.readdirSync(srcDirectory);
    
    await Promise.all(files.map(async filename => {
      const filePath = path.join(srcDirectory, filename);
      if (filePath.startsWith('node_modules') || filePath.startsWith('.')) {
        return; // Skip these files
      }
      if (fs.statSync(filePath).isDirectory()) {
        Object.assign(jsonEntries, await this.readSrcDirectory(filePath));
      } else {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        jsonEntries[filePath] = fileContent;
      }
    }));

    return jsonEntries;
  },

  formatJsonData: function(jsonEntries) {
    return Object.keys(jsonEntries)
      .filter(fp => {
        return fp.endsWith('.js') || fp.endsWith('.gd') || fp.endsWith('.html') || fp.endsWith('.css') || fp.endsWith('.jsx') || fp.endsWith('.svelte');
      })
      .map(a => {
        let filePath = a;
        let filetype = '';
        if (filePath.endsWith('.js')) filetype = 'javascript';
        if (filePath.endsWith('.gd')) filetype = 'gdscript';
        if (filePath.endsWith('.html')) filetype = 'html';
        if (filePath.endsWith('.jsx')) filetype = 'javascript';
        if (filePath.endsWith('.svelte')) filetype = 'svelte';
        const content = jsonEntries[a].trim();
        return `${path.basename(a)}\n\`\`\`${filetype}\n${content}\n\`\`\``;
      })
      .join('\n');
  },

  writeFilesFromStr: function(str) {
    const codeBlocks = [];
    const codeBlockRegex = /^(.*?)(\s*```([\s\S]*?)```)/gm;
    let matches;

    while ((matches = codeBlockRegex.exec(str)) !== null) {
      const name = matches[1] ? matches[1].trim() : "unknown";
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
        console.log(`Writing File: ${name.replace('#','').replace('//','').trim()}`);
        this.writeFile(name.replace('#','').replace('//','').trim(), fileContent);
      }
    });
  },

  writeFile: function(filePath, content) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
};

module.exports = transformationLibrary;
