// First install required packages
// npm install jsdom node-fetch@2

const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('util'); // Use Node's built-in utilities
const { LocalStorage } = require('node-localstorage'); // Note the capitalization

// Create virtual DOM with proper text encoding polyfills
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
        // Add encoding polyfills directly to window
        window.TextDecoder = TextDecoder;
        window.TextEncoder = TextEncoder;
        window.ArrayBuffer = ArrayBuffer;
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
global.TextDecoder = TextDecoder; // Assign to global scope
global.TextEncoder = TextEncoder; // Assign to global scope
global.localStorage = new LocalStorage('./scratch'); // Use uppercase constructor
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

// Enhanced fetch polyfill configuration
global.fetch = fetch; // Polyfill for Node.js global
window.fetch = fetch; // Polyfill for JSDOM window

// Add Request/Response classes if needed
if (!window.Request) {
    window.Request = fetch.Request;
    window.Response = fetch.Response;
}

// Modified authentication configuration
async function configurePuterAuth() {
    // Get these from Puter Developer Portal (https://developer.puter.com)
    const config = {
        appID: 'YOUR_APP_ID', // Replace with actual ID
        authToken: 'YOUR_AUTH_TOKEN', // Replace with actual token
        apiVersion: 'v1' // Verify latest version
    };

    window.puter.ai.APIOrigin = `https://api.puter.com/${config.apiVersion}`;
    window.puter.ai.appID = config.appID;
    window.puter.ai.authToken = config.authToken;

    // Verify authentication
    try {
        console.log('Creating relay token...');
        const relayToken = await window.puter.ai.createRelayToken();
        console.log('Authentication successful. Relay token:', relayToken.slice(0, 8) + '...');
        return true;
    } catch (authError) {
        console.error('Authentication Failed:', {
            code: authError?.response?.status || 401,
            message: authError?.message || 'Invalid credentials'
        });
        return false;
    }
}

// Modified Claude query function
async function claudeQuery(prompt) {
    try {
        console.log('Initializing API session...');
        
        // Configure auth with retries
        let authAttempts = 0;
        while (authAttempts < 3) {
            if (await configurePuterAuth()) break;
            authAttempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (authAttempts >= 3) throw new Error('Authentication failed after 3 attempts');

        console.log('Sending query:', prompt);
        const response = await window.puter.ai.chat(prompt, {
            model: 'claude-3-5-sonnet',
            stream: false,
            timeout: 30000
        });

        // Handle response format
        if (response?.message?.content?.[0]?.text) {
            return response.message.content[0].text;
        }
        throw new Error('Unexpected response format');

    } catch (error) {
        console.error('API Operation Failed:', {
            error: error.message,
            stack: error.stack?.split('\n')[0]
        });
        return null;
    }
}

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

        // Example usage
        const response = await claudeQuery("Explain quantum entanglement in simple terms");
        console.log('Claude 3.5 Response:\n', response);

    } catch (error) {
        console.error('Initialization Error:', error);
    }
})();