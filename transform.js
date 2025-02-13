const puppeteer = require('puppeteer');

async function cycleTasks(url, instruction) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await page.evaluate((instruction) => {
    // Your custom JavaScript to manipulate the page
    // For example, you can change the text of an element
    document.querySelector('h1').textContent = instruction;
  }, instruction);
  await browser.close();
}

module.exports = { cycleTasks };
