#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const dotenv = require('dotenv');
dotenv.config();
const tokens = require('gpt3-tokenizer').default;
const tokenizer = new tokens({ type: 'gpt3' });
const beautify = require("js-beautify/js").js;
const minify = require('html-minifier').minify;
const htmlbeautify = require("js-beautify/js").html;

const OpenAI = require("openai");

if (!process.env.OPENAI_API_KEY) {
    console.log('please set OPENAI_API_KEY in a .env or env var');
    process.exit();
}

const instarray = [...process.argv];
console.trace();
instarray.shift();
instarray.shift();

const transformationInstruction = instarray.join(' ');

const systemPrompt = `perform the following changes: ${transformationInstruction}\nin the following application. Include all the modified or added files complete without comments, Only reply in code in this syntax #^filename&^filecontents#^filename&^filecontents`;

console.log({ prompt: transformationInstruction });

async function generateJsonData() {
    try {
        const srcDirectory = './src'; // Specify the source directory path
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Read all files in the source directory
        const jsonEntries = {};

        const readsrcdirectory = async (srcDirectory) => {
            const files = fs.readdirSync(srcDirectory);

            await Promise.all(files.map(async filename => {
                const filePath = path.join(srcDirectory, filename);
                if (filePath.startsWith('node_modules') || filePath.startsWith('.')) {
                    return; // Skip these files
                }
                if (fs.statSync(filePath).isDirectory()) {
                    // If the "filename" is a directory, recursively read this directory
                    await readsrcdirectory(filePath);
                } else {
                    // Otherwise, read the file and put its contents into jsonEntries
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    let result;

                    try {
                        if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
                            const Terser = require('terser');
                            console.log('TERSERING JS/JSX', { filePath });
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                                output: {
                                    comments: 'all',
                                }
                            })).code;
                        } else if (filePath.endsWith('.json') && filePath !== 'package.json' && filePath !== 'package-lock.json') {
                            console.log('MINIFYING JSON', { filePath });
                            result = JSON.stringify(eval('(' + fileContent + ')'));
                        } else if (filePath.endsWith('.ejs') || filePath.endsWith('.html') || filePath.endsWith('.svelte')) {
                            console.log('MINIFYING HTML', { filePath });
                            const options = {
                                includeAutoGeneratedTags: true,
                                removeAttributeQuotes: true,
                                removeRedundantAttributes: true,
                                removeScriptTypeAttributes: true,
                                removeStyleLinkTypeAttributes: true,
                                sortClassName: true,
                                useShortDoctype: true,
                                collapseWhitespace: true,
                                minifyJS: true
                            };
                            result = minify(fileContent, options);
                        } else {
                            return; // Skip unsupported file types
                        }
                    } catch (e) {
                        console.log(`ERROR ON ${filePath}`, e);
                        return;
                    }

                    jsonEntries[filePath] = result;
                }
            }));
        };

        await readsrcdirectory('./');

        // Save the generated JSON data to a file
        const generatedJsonData = Object.keys(jsonEntries)
            .map(a => `#^${a}&^${jsonEntries[a]}`)
            .join(''); // Pretty-print JSON
        const message = `${generatedJsonData}`;

        const tokensCount = tokenizer.encode(`${transformationInstruction}${transformationInstruction} in the following application:\n\n${message}`).bpe.length + tokenizer.encode(systemPrompt).bpe.length + 15;

        const messages = [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": `${message}+\n\n+${transformationInstruction}` },
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0.1,
            max_tokens: 16384, // Adjust max_tokens based on the input size
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        });
        console.log(response)

        if (response.choices[0].finish_reason === 'length') {
            console.log("BAILING OUT BECAUSE FINISH REASON IS LENGTH, PLEASE USE A BIGGER MODEL");
            return;
        }

        const text = response.choices[0].message.content.trim();
        fs.writeFileSync('transformed.out', text);
        return text;
    } catch (error) {
        console.trace(error);
        console.error('Error:', error);
    }
}

// Function to write files from string response
function writeFilesFromStr(str) {
    const files = str.split('#^');
    console.log({ files });
    files.shift();
    files.forEach(file => {
        console.log("WRITING:", { file });
        const parts = file.split('&^');
        const filePath = parts[0];
        const fileContent = parts[1];
        writeFile(filePath, fileContent);
    });

    function writeFile(filePath, content) {
        const directory = path.dirname(filePath);
        fs.mkdirSync(directory, { recursive: true });

        if (path.extname(filePath) === '.js' || path.extname(filePath) === '.jsx') {
            content = beautify(content, { indent_size: 2, space_in_empty_paren: true });
        }

        if (path.extname(filePath) === '.json') {
            content = JSON.stringify(JSON.parse(content), null, 2);
        }

        if (path.extname(filePath) === '.html' || path.extname(filePath) === '.ejs' || path.extname(filePath) === '.svelte') {
            content = htmlbeautify(content, { indent_size: 2, preserve_newlines: true });
        }

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
