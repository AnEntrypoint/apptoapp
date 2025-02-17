const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add the stealth plugin
puppeteer.use(StealthPlugin());

(async () => {
  // Launch browser with visible UI and stealth configuration
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--window-size=800,600',
      '--no-sandbox',
      '--disable-web-security'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set exact Chrome headers to match the example
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site'
    });

    // Configure browser environment
    await page.evaluateOnNewDocument(() => {
      // Mock Puter SDK
      window.puter = {
        print: (text) => {
          const output = document.getElementById('output');
          output.innerHTML += `<div>${text}</div>`;
        },
        ai: {
          chat: (prompt) => Promise.resolve({
            text: `Simulated response to: ${prompt}\nLife is a Puppeteer test!`,
            model: 'gpt-4o-mini'
          })
        }
      };
    });

    // Create page content
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>AI Chat Runner</title>
          <style>
            #output { padding: 20px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div id="output"></div>
          <script src="https://js.puter.com/v2/"></script>
        </body>
      </html>
    `);

    // Execute chat flow
    console.log('🚀 Starting AI chat sequence...');
    const response = await page.evaluateHandle(async () => {
      puter.print('Initializing AI...');
      const result = await puter.ai.chat('What is life?');
      puter.print(result.text);
      return result;
    });

    // Get output logs
    const logs = await page.$$eval('#output div', els => 
      els.map(e => e.textContent)
    );
    
    console.log('📝 Chat Logs:');
    logs.forEach(log => console.log(` - ${log}`));
    
    console.log('\n✅ AI Response:', await response.jsonValue());

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await browser.close();
    console.log('🛑 Browser closed');
  }
})();