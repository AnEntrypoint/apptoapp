#!/usr/bin/env node
const fs = require('fs');
const { Configuration, OpenAI } = require("openai");
const prettier = require("prettier");
const path = require('path');
require('dotenv').config()
const tokens = require('gpt3-tokenizer').default
const tokenizer = new tokens({ type: 'gpt3' });
const beautify = require("js-beautify/js").js;
const instarray = [...process.argv];
instarray.shift();
instarray.shift();
const transformationInstruction = instarray.join(' ');
const systemPrompt = `${transformationInstruction}. Don't include any explanations in your responses, don't include unmodified files in your responses, include all the modified or added files complete without comments. Only respond in this syntax: ^^filename^filecontents^^|^^filename^filecontents^^`;
var minify = require('html-minifier').minify;
const htmlbeautify = require("js-beautify/js").html;
if(!process.env.OPENAI_API_KEY) {
    console.log('please set OPENAI_API_KEY in a .env or env var')
    process.exit();
}
console.log(transformationInstruction)

async function generateJsonData() {
    try {
        const srcDirectory = './src'; // Specify the source directory path
        const configuration = {
            apiKey: process.env.OPENAI_API_KEY,
        }
        const openai = new OpenAI(configuration);
        // Read all files in the source directory
        const jsonEntries = {};
        const readsrcdirectory = async (srcDirectory) => {
            const files = fs.readdirSync(srcDirectory);

            await files.forEach(async filename => {
                const filePath = path.join(srcDirectory, filename);
                if(filePath.startsWith('node_modules')) {
                    delete jsonEntries[filePath];
                    return;
                }
                if(filePath.startsWith('.')) {
                    delete jsonEntries[filePath];
                    return;
                }
                if (fs.statSync(filePath).isDirectory()) {
                    // If the "filename" is a directory, recursively read this directory
                    readsrcdirectory(filePath);
                } else {
                    // Otherwise, read the file and put its contents into jsonEntries
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    let result;
                    try {
                        if (filePath.endsWith('.js')) {
                            const Terser = require('terser');
                            console.log('TERSERING JS', { filePath })
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                            })).code;
                        } else if (filePath.endsWith('.jsx')) {
                            const Terser = require('terser');
                            console.log('TERSERING JSX', { filePath })
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                            })).code;
                        } else if (filePath.endsWith('.svelte')) {
                            const Terser = require('terser');
                            console.log('TERSERING SVELTE', { filePath })
                            result = (await Terser.minify(fileContent, {
                                mangle: false,
                                compress: false,
                            })).code;
                        } else if (filePath.endsWith('.ejs') || filePath.endsWith('.html')) {
                            console.log('MINIFYING HTML', { filePath })
                            const options = {
                                includeAutoGeneratedTags: true,
                                removeAttributeQuotes: true,
                                removeComments: true,
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
                        console.log(`ERROR ON ${filePath}`)
                        delete jsonEntries[filePath];
                        return;
                    }
                    

                    jsonEntries[filePath] = result;
                }
            });
        }
        await readsrcdirectory('./');
        // Save the generated JSON data to a file
        const generatedJsonData = Object.keys(jsonEntries).map(a => `^^${a}^${jsonEntries[a]}^^`).join('|'); // Pretty-print JSON
        let total = 1
        const message = `${generatedJsonData}`;
        total += tokenizer.encode(`${transformationInstruction} in the following application:\n\n${message}` ).bpe.length + tokenizer.encode(systemPrompt).bpe.length + 15

        const messages = [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": `${transformationInstruction} in the following application:\n\n${message}` },
        ]
        console.log(JSON.stringify(messages, null, 2));
        const question = {
            model: 'gpt-3.5-turbo',
            messages,
            temperature: 0.1,
            max_tokens: 4096 - total,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        }
        const response = await openai.chat.completions.create(
            question
        )
        console.log(response, JSON.stringify(response, null, 2));
        if (response.choices[0].message.finish_reason == 'length') {
            console.log("BAILLING OUT BECAUSE FINISH REASON IS LENGTH< PLEASE USE A BIGGER MODEL")
            return;
        }
        const text = response.choices[0].message.content.trim();
        fs.writeFileSync('transformed.out', text)
        function writeFilesFromStr(str) {
            const files = str.split('^^|');
            files.forEach(file => {
                console.log({file})
                const parts = file.split('^');
                const filePath = parts[2];
                const fileContent = parts[3];
                writeFile(filePath, fileContent);
            });
          
            function writeFile(filePath, content) {
              const directory = path.dirname(filePath);
              fs.mkdirSync(directory, { recursive: true });
          
              if(path.extname(filePath) == '.js' || path.extname(filePath) == '.jsx' || path.extname(filePath) == '.svelte') {
                content = beautify(content, { indent_size: 2, space_in_empty_paren: true });
              }
          
              if(path.extname(filePath) == '.html' || path.extname(filePath) == '.ejs') {
                content = htmlbeautify(content, { indent_size: 2, preserve_newlines: true });
              }
          
              fs.writeFileSync(filePath, content, 'utf8');
            }
        }
        writeFilesFromStr(text)


    } catch (error) {
        console.error(error)
        console.error('Error:', error.response.data);
    }
}

generateJsonData();
