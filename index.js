#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const tokens = require('gpt3-tokenizer').default;
const tokenizer = new tokens({ type: 'gpt3' });
const minify = require('html-minifier').minify;
const htmlbeautify = require("js-beautify/js").html;
const OpenAI = require("openai");
const esbuild = require('esbuild');
const jsYaml = require('js-yaml');
const prettier = require('prettier');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

if (!process.env.OPENAI_API_KEY) {
    console.log('Please set OPENAI_API_KEY in a .env file or as an environment variable.');
    process.exit();
}

const instarray = [...process.argv];
console.trace();
instarray.shift();
instarray.shift();

// Collect the transformation instruction and adjust it
const originalInstruction = instarray.join(' ');
const disallowedPhrases = ['modify my existing project', 'update my project', 'edit existing project', 'modify existing project'];
let transformationInstruction = originalInstruction.toLowerCase();

disallowedPhrases.forEach(phrase => {
    transformationInstruction = transformationInstruction.replace(phrase, '');
});

transformationInstruction = transformationInstruction.trim();

console.log({ prompt: transformationInstruction });

// Define the project directory
let projectDir = '';
const baseProjectName = 'project';

// Function to prompt the user
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

(async () => {
    // Prompt the user for the project directory
    const answer = await promptUser('Enter the project directory to modify: ');
    projectDir = answer.trim();
    if (!projectDir || !fs.existsSync(projectDir)) {
        console.log('Project directory does not exist.');
        const copyAnswer = await promptUser('Do you want to generate a copy of it? (yes/no): ');
        if (copyAnswer.toLowerCase() === 'yes' || copyAnswer.toLowerCase() === 'y') {
            // Generate a new project directory
            projectDir = `${baseProjectName}-${uuidv4()}`;
            console.log(`Creating new project directory: ${projectDir}`);
        } else {
            console.log('Exiting.');
            process.exit();
        }
    } else {
        console.log(`Modifying existing project in directory: ${projectDir}`);
    }
    const text = await generateJsonData(); // Generate new data based on the existing project
    await writeFilesFromStr(text);
})();

async function generateJsonData() {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Read all files in the source directory
        const jsonEntries = {};

        const readsrcdirectory = async (srcDirectory) => {
            const files = fs.readdirSync(srcDirectory);

            await Promise.all(files.map(async filename => {
                const filePath = path.join(srcDirectory, filename);
                const relativePath = path.relative(projectDir, filePath); // Adjusted for projectDir

                if (relativePath.startsWith('node_modules') || relativePath.startsWith('.') || relativePath.startsWith('project')) {
                    return; // Skip these files and the project directories
                }
                if (fs.statSync(filePath).isDirectory()) {
                    // If the "filename" is a directory, recursively read this directory
                    await readsrcdirectory(filePath);
                } else {
                    // Otherwise, read the file and put its contents into jsonEntries
                    const fileContent = await fs.promises.readFile(filePath, 'utf8');
                    let result;

                    try {
                        if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                            // Use esbuild to minify JS/JSX/TS/TSX files
                            console.log('Minifying JS/JSX/TS/TSX', { filePath });
                            const loader = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'ts' : 'js';
                            const esbuildResult = await esbuild.transform(fileContent, {
                                minify: true,
                                loader,
                            });
                            result = esbuildResult.code;
                        } else if (filePath.endsWith('.json') && filePath !== 'package.json' && filePath !== 'package-lock.json') {
                            console.log('Minifying JSON', { filePath });
                            result = JSON.stringify(JSON.parse(fileContent));
                        } else if (filePath.endsWith('.ejs') || filePath.endsWith('.html') || filePath.endsWith('.svelte')) {
                            console.log('Minifying HTML', { filePath });
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
                        } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
                            console.log('Minifying YAML', { filePath });
                            const yamlContent = jsYaml.load(fileContent);
                            result = JSON.stringify(yamlContent);
                        } else if (filePath.endsWith('.sh')) {
                            console.log('Minifying Shell Script', { filePath });
                            result = fileContent
                                .split('\n')
                                .map(line => line.trim())
                                .filter(line => line && !line.startsWith('#'))
                                .join('\n');
                        } else {
                            return; // Skip unsupported file types
                        }
                    } catch (e) {
                        console.log(`ERROR ON ${filePath}`, e);
                        return;
                    }

                    jsonEntries[relativePath] = result;
                }
            }));
        };

        // Use the project directory
        const sourceDir = projectDir;

        await readsrcdirectory(sourceDir);

        // Generate the message for the OpenAI API
        const generatedJsonData = Object.keys(jsonEntries)
            .map(a => `#^${a}&^${jsonEntries[a]}`)
            .join('');
        const message = `${generatedJsonData}`;

        // Include platform description if available
        let platformDescription = '';
        if (fs.existsSync('platform_description.txt')) {
            platformDescription = fs.readFileSync('platform_description.txt', 'utf8');
        }

        const systemPrompt = `You are provided with the code of an application. Perform the following changes to the code: ${transformationInstruction}${platformDescription ? '\n\nPlatform Description:\n' + platformDescription : ''}\nReturn the modified or added files in the following format without any explanations or comments: #^filename&^filecontents#^filename&^filecontents`;

        const tokensCount = tokenizer.encode(`${transformationInstruction} in the following application:\n\n${message}`).bpe.length + tokenizer.encode(systemPrompt).bpe.length + 15;

        const messages = [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": `${message}` },
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.2,
            max_tokens: 16300, // Adjust max_tokens based on the input size
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        });
        console.log(response);

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
async function writeFilesFromStr(str) {
    const files = str.split('#^');
    console.log({ files });
    files.shift();

    // Use Promise.all to handle asynchronous writeFile operations
    await Promise.all(files.map(async (file) => {
        console.log("WRITING:", { file });
        const parts = file.split('&^');
        const filePath = parts[0];
        const fileContent = parts[1];
        await writeFile(filePath, fileContent);
    }));
}

async function writeFile(filePath, content) {
    const outputPath = path.join(projectDir, filePath);
    const directory = path.dirname(outputPath);
    fs.mkdirSync(directory, { recursive: true });

    if (['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(filePath))) {
        const parser = ['.ts', '.tsx'].includes(path.extname(filePath)) ? 'typescript' : 'babel';
        try {
            content = await prettier.format(content, { parser });
        } catch (err) {
            console.error(`Error formatting file ${filePath}:`, err);
        }
    }

    if (path.extname(filePath) === '.json') {
        try {
            content = JSON.stringify(JSON.parse(content), null, 2);
        } catch (err) {
            console.error(`Error parsing JSON in file ${filePath}:`, err);
        }
    }

    if (['.html', '.ejs', '.svelte'].includes(path.extname(filePath))) {
        content = htmlbeautify(content, { indent_size: 2, preserve_newlines: true });
    }

    if (['.yaml', '.yml'].includes(path.extname(filePath))) {
        try {
            const yamlData = JSON.parse(content);
            content = jsYaml.dump(yamlData, { indent: 2 });
        } catch (err) {
            console.error(`Error parsing YAML in file ${filePath}:`, err);
        }
    }

    // For .sh files, you can use a shell script formatter if desired
    // For now, just write the content as is

    fs.writeFileSync(outputPath, content, 'utf8');
}
