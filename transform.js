generateJsonData: async function(transformationInstruction) {
  try {
    console.log("Starting generation: reading source directory...");
    const jsonEntries = await this.readSrcDirectory('./');
    console.log("Finished reading source directory.");

    const generatedJsonData = this.formatJsonData(jsonEntries);
    console.log("Generated JSON data from source files.");

    // Extended system prompt with additional instructions for devnotes, debugging, and Next.js pupdebug command.
    const systemPrompt = `You are a code transformation assistant. Analyze the current project and perform the requested modifications.
Response format must be a JSON array of operations, each with 'operation' and 'params' fields.

Available operations:
- write: params: {path: string, content: string}
- move: params: {from: string, to: string}
- delete: params: {path: string}
- rename: params: {from: string, to: string}
- writeFolder: params: {path: string}
- deleteFolder: params: {path: string}
- cli: params: {command: string}

Important Directives:
1. Maintain a file called 'devnotes.txt' in the project root. All important development notes must be added to this file. Continuously re-evaluate its content—adding any new critical notes and removing outdated ones when they are no longer needed.
2. Insert detailed debug logging to help identify issues when errors occur, but always re-assess these debug logs to remove any that are redundant or no longer necessary.
3. Re-run your operations (i.e. call yourself again) until you are confident that the change is complete, tested, and working.
4. For Next.js projects, after applying modifications, execute the command 'npx pupdebug <HTTP_ADDRESS>' so that client-side logs can be retrieved (using Puppeteer).

Example response:
[
  {"operation": "delete", "params": {"path": "oldfile.js"}},
  {"operation": "write", "params": {"path": "newfile.js", "content": "console.log('hello')"}},
  {"operation": "move", "params": {"from": "src/util.js", "to": "lib/util.js"}},
  {"operation": "writeFolder", "params": {"path": "new_folder"}},
  {"operation": "deleteFolder", "params": {"path": "old_folder"}},
  {"operation": "cli", "params": {"command": "npm run dev"}}
]`;

    const messages = [
      { "role": "system", "content": systemPrompt },
      { "role": "user", "content": `${generatedJsonData}\n\nTransformation request: ${transformationInstruction}` },
    ];

    // Choose API based on configuration
    const usesMistral = process.env.MISTRAL_API_KEY && process.env.MISTRAL_MODEL;
    if (!usesMistral && !process.env.OPENAI_API_KEY) {
      throw new Error('Please set either MISTRAL_API_KEY or OPENAI_API_KEY in .env');
    }

    console.log("Sending API request to", usesMistral ? "Mistral" : "OpenAI", "...");
    let response;
    if (usesMistral) {
      console.log('Using Mistral API');
      response = await this.callMistralAPI(messages);
    } else {
      console.log('Using OpenAI API');
      response = await this.callOpenAIAPI(messages);
    }
    console.log("Received API response.");

    if (this.debug) {
      fs.writeFileSync('transformed.out', response);
      console.log("Response written to transformed.out for debugging.");
    }
    
    // Instead of executing operations here, simply return the response JSON string.
    return response;
  } catch (error) {
    console.error('Error in generateJsonData:', error);
    throw error;
  }
}, 