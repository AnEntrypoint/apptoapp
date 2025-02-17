// First install required packages
// npm install jsdom node-fetch@2

const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding'); // Changed to different polyfill
const { localStorage } = require('node-localstorage'); // Add localStorage polyfill

// Create virtual DOM with enhanced polyfills
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
        window.ArrayBuffer = ArrayBuffer; // Polyfill ArrayBuffer
        window.crypto = {
            getRandomValues: require('crypto').webcrypto.getRandomValues
        };
    }
});

// Enhanced polyfill configuration
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.fetch = fetch;
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
global.localStorage = new localStorage('./scratch'); // Configure localStorage
global.crypto = window.crypto; // Polyfill crypto

// Add abort controller polyfill
const { AbortController } = require('abort-controller');
global.AbortController = AbortController;

// Modified resource loader to handle external dependencies
dom.window.document._write = dom.window.document.write;
dom.window.document.write = function(html) {
    // Prevent document.write from clearing existing content
    const range = document.createRange();
    const parsed = range.createContextualFragment(html);
    document.body.appendChild(parsed);
};

// Load Puter.js dynamically
(async () => {
    try {
        console.log('[1/5] Setting up virtual browser environment...');
        
        // Add timeout for Puter.js initialization
        const initTimeout = setTimeout(() => {
            throw new Error('Puter.js initialization timed out after 30 seconds');
        }, 30000);

        console.log('[2/5] Fetching Puter.js...');
        const puterScript = await fetch('https://js.puter.com/v2/').then(res => res.text());
        
        console.log('[3/5] Injecting Puter.js into virtual DOM...');
        const script = window.document.createElement('script');
        script.textContent = puterScript;
        window.document.body.appendChild(script);

        // Enhanced initialization checker
        let retries = 0;
        const maxRetries = 30; // 30 * 500ms = 15 seconds
        const checkPuter = () => new Promise((resolve, reject) => {
            const check = () => {
                console.log(`[4/5] Checking Puter.js initialization (attempt ${retries + 1}/${maxRetries})`);
                
                if (window.puter?.ai?.chat) {
                    clearTimeout(initTimeout);
                    console.log('[5/5] Puter.js successfully initialized!');
                    resolve();
                } else if (retries < maxRetries) {
                    retries++;
                    setTimeout(check, 500);
                } else {
                    clearTimeout(initTimeout);
                    reject(new Error('Puter.js failed to initialize after 15 seconds'));
                }
            };
            check();
        });

        await checkPuter();
        
        // Cleanup
        window.document.body.removeChild(script);
        dom.window.close();

        // Claude 3.5 Sonnet API implementation
        async function claudeQuery(prompt) {
            console.log(`Sending query to Claude 3.5: "${prompt}"`);
            try {
                console.log('Accessing Puter.ai:', window.puter.ai);
                const response = await window.puter.ai.chat(prompt, { 
                    model: 'claude-3-5-sonnet',
                    stream: false
                });
                console.log('Received response from Claude 3.5:', response);
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