const puppeteer = require('puppeteer');

function transform(input, instruction) {
  switch (instruction) {
    case 'lowercase':
      return input.toLowerCase();
    case 'reverse':
      return input.split('').reverse().join('');
    case 'uppercase':
      return input.toUpperCase();
    default:
      throw new Error(`Unknown instruction: ${instruction}`);
  }
}

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

module.exports = {
  cycleTasks,
  transform
};