// First install required packages
// npm install jsdom node-fetch@2

const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');

// Create a virtual DOM environment
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
});

// Get the global window object
const { window } = dom;
global.window = window;
global.document = window.document;
global.fetch = fetch; // Polyfill fetch

// Load Puter.js dynamically
(async () => {
    try {
        // Load Puter.js from CDN
        const puterScript = await fetch('https://js.puter.com/v2/').then(res => res.text());
        const script = window.document.createElement('script');
        script.textContent = puterScript;
        window.document.body.appendChild(script);

        // Wait for Puter.js to load
        await new Promise(resolve => setTimeout(resolve, 500));

        // Claude 3.5 Sonnet API implementation
        async function claudeQuery(prompt) {
            try {
                const response = await window.puter.ai.chat(prompt, { 
                    model: 'claude-3-5-sonnet',
                    stream: false
                });
                
                return response.message.content[0].text;
            } catch (error) {
                console.error('API Error:', error);
                return null;
            }
        }

        // Example usage
        const response = await claudeQuery("Explain quantum entanglement in simple terms");
        console.log('Claude 3.5 Response:\n', response);

    } catch (error) {
        console.error('Initialization Error:', error);
    }
})();