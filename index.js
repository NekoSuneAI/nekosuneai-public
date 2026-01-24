const { config } = require("./Modules/config");

const { sequelize } = require('./Modules/Addons/db');
const Message = require('./Modules/models/Message');

const {
  startRecordingAndRunDeepSpeech,
} = require("./Modules/AUTOAI/VOICEModules/Main");

const {
  sendToWebhookerror
} = require("./Modules/AUTOAI/AddonsModules/API/Webhooks");

//////////////////////////////////////////////////
//AI SYSTEM
require("log-timestamp"); //npm log-timestamp
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;

//////////////////////////////////////////////////

if (config.addons.AI.toggle == true) {
  startRecordingAndRunDeepSpeech();
  (async () => {
    if (sequelize) {
      await sequelize.sync();
    } else {
      console.warn('[DB] Skipping sqlite sync (sqlite3 not installed).');
    }
  })();
}

if (config.addons.FriendsSystem.toggle == true) {
  const { VRCFriends } = require("./Modules/FriendsSystem/Modules/VRChat");
  const { BOTAPIPOINT } = require("./Modules/FriendsSystem/Modules/Web");

  VRCFriends();
  BOTAPIPOINT();
}

if (config.discord.toggle == true) {
  const { discordLogin } = require("./Modules/DiscordBOT/index");

  discordLogin();
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
