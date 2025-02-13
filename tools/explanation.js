/**
 * @tool explanation
 * @description Logs an explanation message to the console. If no message is provided, it logs a warning.
 * @param {string} message - The message to be logged as an explanation.
 * @returns {Promise<void>} A promise that resolves when the logging is complete.
 */
async function explanation(message) {
  if (!message) {
    console.log('No message provided for explanation.');
    return;
  }
  console.log('---- EXPLANATION ----\n\n', message,'\n\n');
}

module.exports = explanation;