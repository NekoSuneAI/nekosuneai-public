const { config } = require("./Modules/config");

const {
  startRecordingAndRunDeepSpeech
} = require("./Modules/AUTOAI/VOICEModules/Main");

//////////////////////////////////////////////////
//AI SYSTEM
require("log-timestamp"); //npm log-timestamp
const chalk = require("chalk");

//////////////////////////////////////////////////

if (config.addons.AI.toggle == true) {
  startRecordingAndRunDeepSpeech();
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

  console.log(err, origin);
  startRecordingAndRunDeepSpeech();
});
