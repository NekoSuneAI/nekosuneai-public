const { config } = require("../../../config");

const { Server } = require("node-osc");
const { playAudioSound } = require("../../AddonsModules/Audios/AudioDownloader");

async function LoadsReadOSC() {
  const oscServer = new Server(
    config.VRCACC.OSC_READ_PORT,
    config.VRCACC.OSC_TARGET_ADDRESS
  );

  // Event listener for incoming messages
  oscServer.on("message", function(msg) {
    //console.log('Message received:', msg);

    // Process the message
    const address = msg[0];
    const args = msg.slice(1);

    //console.log('Address:', address);
    //console.log('Arguments:', args);

    // Add your custom logic here based on the address and arguments
    handleOscMessage(address, args);
  });

  // Handle server errors
  oscServer.on("error", function(err) {
    console.error("Server error:", err);
  });

  // Log when the server is listening
  oscServer.on("listening", function() {
    console.log(
      `VRChat is listening on port '${config.VRCACC.OSC_READ_PORT}' To Read OSC`
    );
  });
}

const { sendMSGOSC } = require("../../AddonsModules/OSC/Send");

const { generateTts } = require("../../VOICEModules/Speak");

// Function to handle OSC messages based on address and arguments
async function handleOscMessage(address, args) {
  // Example of handling different OSC addresses
  switch (address) {
    case "/avatar/parameters/VelocityX":
      //console.log('VelocityX:', args[0]);
      break;
    case "/avatar/parameters/VelocityY":
      //console.log('VelocityY:', args[0]);
      break;
    case "/avatar/parameters/VelocityZ":
      //console.log('VelocityZ:', args[0]);
      break;
    case "/avatar/parameters/IsGrounded":
      //console.log('IsGrounded:', args[0]);
      break;
    case "/avatar/parameters/Hit Hold":
      //console.log('IsHit Hold:', args[0]);
      break;
    case "/avatar/parameters/Chest_Hit":
      console.log("IsChest_Hit:", args[0]);
      if (args[0] == true) {
        var msgchest =
          "Please do not touch me there, thats my privacy part of my body that no one not allowed touch other then my master.";

        sendMSGOSC(msgchest);
        const audioFileAi = await generateTts(msgchest, config.addons.AI.voice || "en_US-lessac-medium", `audio/aiout_${Date.now()}.wav`);
        playAudioSound(audioFileAi);
      }
      break;
    // Add more cases for other OSC addresses you are interested in
    default:
      //console.log('Unhandled OSC address:', address);
      break;
  }
}

module.exports = {
  LoadsReadOSC
};
