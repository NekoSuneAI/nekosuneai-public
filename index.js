const { config } = require('./Modules/config');

const {
    startRecordingAndRunDeepSpeech
}= require('./Modules/AUTOAI/VOICEModules/Main');

const {
    sendToWebhookerror
} = require('./Modules/AUTOAI/AddonsModules/API/Webhooks');

const { 
    LoadsReadOSC
} = require('./Modules/AUTOAI/AddonsModules/OSC/Recieved');

//////////////////////////////////////////////////
//AI SYSTEM
require('log-timestamp'); //npm log-timestamp
const chalk = require("chalk");

//////////////////////////////////////////////////

if (config.addons.AI.toggle == true) {
    startRecordingAndRunDeepSpeech();
    LoadsReadOSC();
}

if (config.addons.FriendsSystem.toggle == true) {
    const { 
        VRCFriends
    } = require('./Modules/FriendsSystem/Modules/VRChat');

    VRCFriends();
}

// ———————————————[Error Handling]———————————————
process.on("unhandledRejection", (reason, p) => {

    if (reason === "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred.") return;

    console.log(chalk.gray("—————————————————————————————————"));
    console.log(
        chalk.white("["),
        chalk.red.bold("AntiCrash"),
        chalk.white("]"),
        chalk.gray(" : "),
        chalk.white.bold("Unhandled Rejection/Catch")
    );
    console.log(chalk.gray("—————————————————————————————————"));

    sendToWebhookerror(`NekoSuneAI Error (unhandledRejection)`, reason);
    console.log(reason, p);
    startRecordingAndRunDeepSpeech();
});
process.on("uncaughtException", (err, origin) => {
    console.log(chalk.gray("—————————————————————————————————"));
    console.log(
        chalk.white("["),
        chalk.red.bold("AntiCrash"),
        chalk.white("]"),
        chalk.gray(" : "),
        chalk.white.bold("Uncaught Exception/Catch")
    );
    console.log(chalk.gray("—————————————————————————————————"));

    sendToWebhookerror(`NekoSuneAI Error (uncaughtException)`, err);
    console.log(err, origin);
    startRecordingAndRunDeepSpeech();
});