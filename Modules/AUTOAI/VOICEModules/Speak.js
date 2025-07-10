const {
    sendMSGOSC
} = require('../AddonsModules/OSC/Send');

const { 
    writeToLogFile
} = require('./LogFiles'); 

const fs = require('fs');
const say = require('say');

function speakText(text) {
    return new Promise((resolve, reject) => {
        say.speak(text, 'Cortana', 1.0, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function readAndPrintSentences(sentences, audioFile, messageid) {
    const {
        startRecordingAndRunDeepSpeech
    } = require('../VOICEModules/Main');
    const {
        sendToWebhookchatResponse
    }  = require('../AddonsModules/API/Webhooks');
    // This was added to fixed a issues with the Error: startRecordingAndRunDeepSpeech is not a function

    const totalPages = sentences.length;
    let currentPage = 1;

    for (const sentence of sentences) {
        console.log(`Reading: Page ${currentPage}/${totalPages}: ${sentence}`);
        writeToLogFile(`Reading: Page ${currentPage}/${totalPages}: ${sentence}`);
        sendToWebhookchatResponse(`Page ${currentPage}/${totalPages}: ${sentence}`, messageid).then(datauwu => { console.log("Responded Message to Discord") })
        sendMSGOSC(`${sentence} \n⏪${currentPage}/${totalPages}⏩`);
        await speakText(sentence);
        currentPage++;
    }

    console.log('Finished reading all sentences.');
    writeToLogFile('Finished reading all sentences.');
    // Delete the renamed audio file after recognition.
    fs.unlinkSync(audioFile);
    // Start recording and running DeepSpeech again.
    startRecordingAndRunDeepSpeech();
}

module.exports = { 
    readAndPrintSentences,
    speakText,
};