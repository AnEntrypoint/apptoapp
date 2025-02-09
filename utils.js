const fsp = require('fs').promises;
const ignore = require('ignore');
const path = require('path');
const { exec } = require('child_process');

const cmdhistory = [];
async function executeCommand(command, options = {}) {
    console.log('Command history size:', cmdhistory.join().length, 'B');
    return new Promise((resolve) => {
        const child = exec(command, {
            timeout: 120000,
            cwd: process.cwd(),
            ...options
        });
        cmdhistory.push(command);
        if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100); // Limit cmdhistory to 100 lines

        const output = { stdout: [], stderr: [] };

        child.stdout.on('data', (data) => {
            const trimmed = data.toString().trim();
            cmdhistory.push(trimmed);
            if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100); // Limit cmdhistory to 100 lines
            output.stdout.push(trimmed);
            console.log(`[CMD] ${trimmed}`); // Added console log for stdout
        });

        child.stderr.on('data', (data) => {
            const trimmed = data.toString().trim();
            cmdhistory.push(trimmed);
            if (cmdhistory.length > 100) cmdhistory.splice(0, cmdhistory.length - 100); // Limit cmdhistory to 100 lines
            output.stderr.push(trimmed);
            console.error(`[CMD-ERR] ${trimmed}`); // Added console log for stderr
        });

        child.on('close', (code) => {
            console.log(`Command closed with code: ${code}`); // Added log for command close
            resolve({
                code,
                stdout: output.stdout.join('\n'),
                stderr: output.stderr.join('\n')
            });
        });

        // Auto-answer 'yes' to any y/n questions
        child.stdin.write('Y\n');
        child.stdin.write('Y\n');
        child.stdin.end();
    });
}

async function loadIgnorePatterns(ignoreFile = '.llmignore') {
    const currentPath = process.cwd();
    const sourcePath = path.join(__dirname, ignoreFile); // Assuming the library is in the same directory as this file

    const ignoreFiles = [ignoreFile, sourcePath];
    let ignoreContent = '';

    for (const file of ignoreFiles) {
        try {
            ignoreContent = await fsp.readFile(file, 'utf8');
            return ignore().add(ignoreContent.split('\n').filter(l => !l.startsWith('#')));
        } catch (error) {
            if (error.code === 'ENOENT') {
            } else {
                throw error;
            }
        }
    }

    console.log(`No ignore files found, using empty ignore list`);
    return ignore();
}

async function loadNoContentsPatterns(ignoreFile = '.nocontents') {
    const currentPath = process.cwd();
    const sourcePath = path.join(__dirname, ignoreFile); // Path of the library

    let ignoreContent = '';

    // Check current path first
    try {
        ignoreContent = await fsp.readFile(ignoreFile, 'utf8');
        return ignore().add(ignoreContent.split('\n').filter(l => !l.startsWith('#')));
    } catch (error) {
        if (error.code === 'ENOENT') {
        } else {
            throw error;
        }
    }

    // Check library path
    try {
        ignoreContent = await fsp.readFile(sourcePath, 'utf8');
        return ignore().add(ignoreContent.split('\n').filter(l => !l.startsWith('#')));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return ignore();
        }
        throw error;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function makeApiRequest(messages, tools, apiKey, endpoint) {
    console.log(`API Request to ${endpoint}`);
    const data = [endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "codestral-latest",
            messages,
            "tool_choice": "any",
            tools,
            stream: false
        })
    }];
    const response = await fetch(...data);

    async function writeToLastCall(data) {
        try {
            await fsp.writeFile('../lastcall.txt', data, 'utf8');
        } catch (error) {
            console.error('Error writing to lastcall.txt:', error);
        }
    }

    await writeToLastCall(JSON.stringify(JSON.parse(data[1].body), null, 2));

    if (!response.ok) {
        const error = await response.json();
        console.error('API Error:', JSON.stringify(error, null, 2));
        throw new Error(`API error: ${error.message || response.statusText}`);
    }
    const val = await response.json();
    console.log('API Response:', val);
    return val;
}

async function directoryExists(dir) {
    try {
        await fsp.access(dir);
        console.log(`Directory exists: ${dir}`);
        return true;
    } catch {
        console.log(`Directory does not exist: ${dir}`);
        return false;
    }
}

// scanDirectory is a unified directory scanner.
// handler is a function(fullPath, relativePath) that returns an item (or null) for each file.
async function scanDirectory(dir, ig, handler, baseDir = dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const results = [];
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        // Normalize path to POSIX style and make relative to original base
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        
        // Skip both files and directories that match the ignore patterns
        if (ig.ignores(relativePath)) {
            console.log(`Ignoring: ${relativePath} matched pattern.`);
            continue;
        }

        if (entry.isDirectory()) {
            results.push(...await scanDirectory(fullPath, ig, handler, baseDir));
        } else {
            const result = handler(fullPath, relativePath);
            results.push(result);
        }
    }
    
    return results;
}

// createErrorNote consolidates error note creation.
// It appends a formatted note to NOTES.txt and returns the note string.
async function createErrorNote(errorDetails) {
    const timestamp = new Date().toISOString();
    const noteContent = `[${timestamp}] Error in ${errorDetails.tool || 'unknown-tool'} (${errorDetails.phase || 'unknown-phase'}): ${errorDetails.error}\n` +
        (errorDetails.stack ? `Stack: ${errorDetails.stack}\n` : '');
    try {
        await fsp.appendFile('NOTES.txt', `\n${noteContent}\n`, 'utf8');
    } catch (err) {
        console.error('Failed to write error note:', err);
    }
    return noteContent;
}

module.exports = {
    loadIgnorePatterns,
    loadNoContentsPatterns,
    formatBytes,
    makeApiRequest,
    directoryExists,
    scanDirectory,
    createErrorNote,
    executeCommand,
    cmdhistory
};