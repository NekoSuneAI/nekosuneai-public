const { config } = require('../../../config');

const {
    Client,
    Message
} = require('node-osc');

const oscClient = new Client(
    config.VRCACC.OSC_TARGET_ADDRESS,
    config.VRCACC.OSC_TARGET_PORT
);

function sendMSGOSC(message) {
    oscClient.send(
        new Message(
            "/chatbox/input",
            `${message}`,
            true,
            false
        )
    );
}

function sendOSC(perms, values, toggle1, toggle2) {
    oscClient.send(
        new Message(
            perms,
            values,
            toggle1,
            toggle2
        )
    );
}

module.exports = { 
    sendMSGOSC,
    sendOSC
};