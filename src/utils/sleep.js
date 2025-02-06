/**
 * Pauses execution for the specified duration
 * @param {number} ms - Duration to sleep in milliseconds
 * @returns {Promise} - Resolves after the specified duration
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = sleep;
