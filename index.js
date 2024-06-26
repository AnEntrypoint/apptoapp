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

const { Configuration, OpenAIApi } = require("openai");

if(!process.env.OPENAI_API_KEY) {
    console.log('please set OPENAI_API_KEY in a .env or env var');
    process.exit();
}

const instarray = [...process.argv];
console.trace();
instarray.shift();
instarray.shift();

const transformationInstruction = instarray.join(' ');

const systemPrompt = `perform the following changes: ${transformationInstruction}\nin the following application. Include all the modified or added files complete without comments, Only reply in code in this syntax #^filename&^filecontents#^filename&^filecontents`;

console.log({prompt: transformationInstruction});

async function generateJsonData() {
    try {
        const srcDirectory = './src'; // Specify the source directory path
        const configuration = new Configuration({
            apiKey: process.env.OPENAI_API_KEY,
        });
        const openai = new OpenAIApi(configuration);

        // Read all files in the source directory
        const jsonEntries = {};

        const readsrcdirectory = async (srcDirectory) => {
            const files = fs.readdirSync(srcDirectory);
            
            await files.forEach(async filename => {
                const filePath = path.join(srcDirectory, filename);
                if (filePath.startsWith('node_modules')) {
                    delete jsonEntries[filePath];
                    return;
                }
                if (filePath.startsWith('.')) {
                    delete jsonEntries[filePath];
                    return;
                }
                if (fs.statSync(filePath).isDirectory()) {
                    // If the "filename" is a directory, recursively read this directory
                    await readsrcdirectory(filePath);
                } else {
                    // Otherwise, read the file and put its contents into jsonEntries
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    let result;
                    try {
                        if (filePath.endsWith('.js')) {
                            const Terser = require('terser');
                            console.log('TERSERING JS', { filePath });
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                                output: {
                                    comments:'all',
                                }
                            })).code;
                        } else if (filePath.endsWith('.jsx')) {
                            const Terser = require('terser');
                            console.log('TERSERING JSX', { filePath });
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                                output: {
                                    comments: 'all',
                                }
                            })).code;
                        } else if (filePath.endsWith('.json') && filePath !== 'package.json' && filePath !== 'package-lock.json') {
                            console.log('MINIFYING JSON', { filePath });
                            console.log(fileContent);
                            result = JSON.stringify(eval('('+fileContent+')'));
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
                            delete jsonEntries[filePath];
                            return;
                        }
                    } catch(e) {
                        console.log(`ERROR ON ${filePath}`);
                        delete jsonEntries[filePath];
                        return;
                    }                                       
                    jsonEntries[filePath] = result;
                }
            });
        }

        await readsrcdirectory('./');

        // Save the generated JSON data to a file
        const generatedJsonData = Object.keys(jsonEntries).map(a => `#^${a}&^${jsonEntries[a]}`).join(''); // Pretty-print JSON
        let total = 1;
        const message = `${generatedJsonData}`;

        total += tokenizer.encode(`${transformationInstruction}${transformationInstruction} in the following application:\n\n${message}`).bpe.length + tokenizer.encode(systemPrompt).bpe.length + 15;

        const messages = [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": `${message}+\n\n+${transformationInstruction}` },
        ];

        const question = {
            model: 'gpt-4o',
            messages,
            temperature: 0.1,
            max_tokens: 4096,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        };

        const response = await openai.createChatCompletion(question);

        console.log(response.data, JSON.stringify(response.data, null, 2));

        if (response.data.choices[0].finish_reason == 'length') {
            console.log("BAILING OUT BECAUSE FINISH REASON IS LENGTH, PLEASE USE A BIGGER MODEL");
            return;
        }

        const text = response.data.choices[0].message.content.trim();
        fs.writeFileSync('transformed.out', text);
        return text;
    } catch (error) {
        console.trace(error);
        console.error('Error:', error.response.data);
    }
}

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

        if (path.extname(filePath) == '.js' || path.extname(filePath) == '.jsx') {
            content = beautify(content, { indent_size: 2, space_in_empty_paren: true });
        }

        if (path.extname(filePath) == '.json') {
            content = JSON.stringify(JSON.parse(content, null, 2));
        }

        if (path.extname(filePath) == '.html' || path.extname(filePath) == '.ejs' || path.extname(filePath) == '.svelte') {
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
