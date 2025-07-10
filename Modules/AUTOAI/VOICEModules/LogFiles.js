const fs = require('fs');

function writeToLogFileMusic(message) {
    // Constants.
    const DIRECTORY = '../../logs/';
    // Create the path to write recordings to.
    if (!fs.existsSync(DIRECTORY)) {
        fs.mkdirSync(DIRECTORY);
    }
    const logFilePath = '../../logs/Music.log'; // Replace with your desired log file path
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

function writeToLogFile(message) {
    // Constants.
    const DIRECTORY = '../../logs/';
    // Create the path to write recordings to.
    if (!fs.existsSync(DIRECTORY)) {
        fs.mkdirSync(DIRECTORY);
    }
    const logFilePath = '../../logs/data.log'; // Replace with your desired log file path
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

module.exports = { 
    writeToLogFileMusic,
    writeToLogFile
};