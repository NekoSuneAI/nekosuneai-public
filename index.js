const { config } = require("./Modules/config");

const {
  startRecordingAndRunDeepSpeech
} = require("./Modules/AUTOAI/VOICEModules/Main");

const {
  sendToWebhookerror
} = require("./Modules/AUTOAI/AddonsModules/API/Webhooks");

const fs = require('fs').promises;
const path = require('path');
const { https } = require('follow-redirects');
const { pipeline } = require('stream');
const util = require('util');
const pipelineAsync = util.promisify(pipeline);
const os = require('os');
const logger = console;
const readline = require('readline');
const unzipper = require('unzipper');
const {loadTtsConfigs} = require("./Modules/AUTOAI/VOICEModules/Speak");

const { LoadsReadOSC } = require("./Modules/AUTOAI/AddonsModules/OSC/Recieved");

//////////////////////////////////////////////////
//AI SYSTEM
require("log-timestamp"); //npm log-timestamp
const chalk = require("chalk");

//////////////////////////////////////////////////

if (config.addons.AI.toggle == true) {
  startRecordingAndRunDeepSpeech();
}

if (config.addons.FriendsSystem.toggle == true) {
  const { VRCFriends } = require("./Modules/FriendsSystem/Modules/VRChat");

  VRCFriends();
}

// ———————————————[Error Handling]———————————————
process.on("unhandledRejection", (reason, p) => {
  if (
    reason ===
    "Error [INTERACTION_ALREADY_REPLIED]: The reply to this interaction has already been sent or deferred."
  )
    return;

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
