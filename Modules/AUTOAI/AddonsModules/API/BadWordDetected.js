const { badwords } = require('../../../config');

const { 
    writeToLogFile
} = require('../../VOICEModules/LogFiles');

const say = require('say'); // Import the 'say' package
const fs = require('fs');

function findWord(word, str) {
    return str.split(' ').some(function(w) {
        return w === word
    })
}

function containsBannedWord(message) {
    for (var i = 0; i < badwords.length; i++) {
        if (findWord(badwords[i], message)) {
            console.log("Found bad word: " + badwords[i]);
            writeToLogFile("Found bad word: " + badwords[i]);
            return true;
        }
    }
}

async function BadWordDetected(audioFile, messageid) {

    const { 
        sendMSGOSC
    } = require('../OSC/Send');
    
    const { 
        startRecordingAndRunDeepSpeech,
    } = require('../../VOICEModules/Main');

    const {
        sleep
    } = require('../ShortCuts');

    const {
        sendToWebhookchatResponse
    }  = require('./Webhooks');

    return new Promise(async (resolve, reject) => {
        sendMSGOSC(`[FORBIDDEN ACCESS]`)
        await sleep(5000);
        sendMSGOSC(`This infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.`)
        sendToWebhookchatResponse(`[FORBIDDEN ACCESS]\n\nThis infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.`, messageid).then(datauwu => { console.log(datauwu) });
        say.speak('This infomation is Forbidden access by my Creator, Please follow VRChat Terms of Service.', 'Cortana', 1.0, (err) => {
            if (err) {
                reject(err);
            } else {
                fs.unlinkSync(audioFile);
                startRecordingAndRunDeepSpeech();
                resolve();
            }
        });
    });
}

module.exports = { 
    BadWordDetected,
    containsBannedWord
};