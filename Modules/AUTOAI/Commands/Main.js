const { config } = require('../../config');

const checkCondition = (text) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("what is time in") ||
        lowerText.includes("what is time at") ||
        lowerText.includes("what is the time like") ||
        lowerText.includes("what is the time like in") ||
        lowerText.includes("what time is it in")) {
        return "timeQuery";
    } else if (lowerText.includes("what is weather in") ||
        lowerText.includes("what is weather at") ||
        lowerText.includes("what is the weather like") ||
        lowerText.includes("what is the weather like in")) {
        return "weatherQuery";
    } else if (lowerText.includes("tell me a joke") ||
        lowerText.includes("tell me a funny joke") ||
        lowerText.includes("tell me a joke.") ||
        lowerText.includes("tell me a funny joke.")) {
        return "jokeQuery";
    }
    return "default";
};

const {
    BadWordDetected,
    containsBannedWord
} = require('../AddonsModules/API/BadWordDetected');

const {
    readAndPrintSentences
} = require('../VOICEModules/Speak');

const {
    sendMSGOSC
} = require('../AddonsModules/OSC/Send');

const { 
    writeToLogFile
} = require('../VOICEModules/LogFiles'); 
const e = require('express');


async function RunCommands(audioFile, result, messageid) {
    switch(checkCondition(result[0].text)){
            case "timeQuery": 
                const { 
                    TimezonesGrabber
                } = require('../AddonsModules/API/Timezones')
                var originalText = result[0].text.toLowerCase();
                // Example usage:
                TimezonesGrabber(originalText).then(resp => {
                    var datafound = `Time in ${originalText}: ${resp.ampm}`;
                    writeToLogFile("[TimeZone API] Recognized: " + datafound);
                    var responsetext = [
                        datafound
                    ];
                    readAndPrintSentences(responsetext, audioFile, messageid);
                })
                .catch(error => {
                    console.error(error);
                });
                break;
            case "weatherQuery":
		console.log(config.addons.apikey.weather.key)
                if (config.addons.apikey.weather.key == "" || config.addons.apikey.weather.key == null || config.addons.apikey.weather.key == undefined) {
                    console.log('[Weather API] Error: No API key found.');
                    writeToLogFile('[Weather API] Error: No API key found.');
                    var responsetext = [
                        'Error: No API key found for Weather Endpoint.'
                    ];
                    readAndPrintSentences(responsetext, audioFile, messageid);
                } else {
                    const { 
                        WeatherGrabber
                    } = require('./../AddonsModules/API/Weathers')
                    var originalText = result[0].text.toLowerCase();
                    WeatherGrabber(originalText).then(resp => {
                        console.log(resp)
                        writeToLogFile("[Weather API] Recognized: " + resp);
                        var responsetext = [
                            resp
                        ];
                        readAndPrintSentences(responsetext, audioFile, messageid);
                    }).catch(error => {
                        console.error(error);
                    });
                }
                break; 
            case "jokeQuery":
                const { 
                    JokesGrabber
                } = require('./../AddonsModules/API/Jokes')
                JokesGrabber(config.addons.filters.explicit.joke).then(resp => {
                    readAndPrintSentences(resp, audioFile, messageid);
                    writeToLogFile(resp);
                }).catch(error => {
                    console.error(error);
                });
                break;
            default:
                // Your default case
                sendMSGOSC(`Thinking.....`)
                console.log('Thinking.....')
                const { 
                    RESPGPT
                } = require('../AddonsModules/API/GPTNODE')
                const {
                    sendToWebhookchatResponse
                }  = require('../AddonsModules/API/Webhooks');
                const response = await RESPGPT(result[0].text, config.addons.AI.OPENAI.gptModel)
                //console.log('[gpt api dev]', response)
                if (response.status == 200) {
                    console.log('[ChatGPT Local] Recognized text:', response.content);
                    writeToLogFile("[ChatGPT Local] Recognized text: " + response.content);
                    if (containsBannedWord(response.content)) {
                        BadWordDetected(audioFile, messageid);
                    } else {
                        await readAndPrintSentences(response.contentarray, audioFile, messageid);
                    }
                } else if (response.status == 504) {
                    console.log('[ChatGPT Local] Recognized text:', response.content);
                    writeToLogFile("[ChatGPT Local] Recognized text: " + response.content);
                    var responsetext = [
                        `Can you say question again? or ChatGPT Local Request timed out`
                    ];

                    await sendToWebhookchatResponse(`Can you say question again? or ChatGPT Local Request timed out`, messageid)
                    sendMSGOSC(responsetext)
                    readAndPrintSentences(responsetext, audioFile, messageid);
                } else {
                    const {
                        startRecordingAndRunDeepSpeech
                    } = require('../VOICEModules/Main');
                    //console.log(`Server error: ${response.status} ${response.statusText}`);
                    // Delete the renamed audio file after recognition.
                    fs.unlinkSync(audioFile);
                    // Start recording and running DeepSpeech again.
                    startRecordingAndRunDeepSpeech();
                }
                break;
    }
}

module.exports = {
    RunCommands
};