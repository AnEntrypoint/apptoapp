const fs = require('fs');

function readTodo() {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = fs.readFileSync('TODO.txt', 'utf8');
      return data.split('\n').map(line => line.trim()).filter(line => line !== '');
    }
    return [];
  } catch (error) {
    console.error('Error reading TODO.txt:', error);
    return [];
  }
}

function removeTask(task) {
  try {
    if (fs.existsSync('TODO.txt')) {
      const data = fs.readFileSync('TODO.txt', 'utf8');
      const updatedData = data.split('\n').filter(line => line.trim() !== task).join('\n');
      fs.writeFileSync('TODO.txt', updatedData);
      console.log(`Removed task: ${task}`);
    }
  } catch (error) {
    console.error('Error removing task:', error);
  }
}

function appendChangelog(task, message) {
  try {
    const logEntry = `${new Date().toISOString()} - ${message} - Task: ${task}\n`;
    fs.appendFileSync('CHANGELOG.txt', logEntry);
    console.log(`Appended to CHANGELOG.txt: ${logEntry.trim()}`);
  } catch (error) {
    console.error('Error appending to CHANGELOG.txt:', error);
  }
}

module.exports = { readTodo, removeTask, appendChangelog };