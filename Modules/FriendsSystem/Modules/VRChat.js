const {
    config,
    packageJson
} = require('../../config');

const {
    BOTAPIPOINT
} = require('./Web')

const WebSocketClient = require("websocket").client; //npm websocket
const vrchat = require("vrchat"); //npm vrchat
//require('log-timestamp');                 //npm log-timestamp
const twofactor = require("node-2fa");
const fetch = require('node-fetch');
const bodyParser = require('body-parser');

const {
    Client,
    Message
} = require('node-osc');

let userAgent = `NekoSuneAIBOT/${packageJson.version} ${config.VRCACC.username}`
const newToken = twofactor.generateToken(config.VRCACC.twofatoken);

const configuration = new vrchat.Configuration({
    username: encodeURIComponent(config.VRCACC.username),
    password: encodeURIComponent(config.VRCACC.password),
    baseOptions: {
        headers: {
            "User-Agent": userAgent,
        }
    }
});


//----------  APIS DEFINED  ----------//
const AuthenticationApi = new vrchat.AuthenticationApi(configuration);
const NotificationsApi = new vrchat.NotificationsApi(configuration);
const WorldApi = new vrchat.WorldsApi(configuration);
const InviteApi = new vrchat.InviteApi(configuration);
const UsersApi = new vrchat.UsersApi(configuration);
const WorldsApi = new vrchat.WorldsApi(configuration);
const GroupsApi = new vrchat.GroupsApi(configuration);
const FriendsApi = new vrchat.FriendsApi(configuration);

let currentUser;
let vrcHeaders; //Used to connect

const oscClient = new Client(config.VRCACC.OSC_TARGET_ADDRESS, config.VRCACC.OSC_TARGET_PORT);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function VRCFriends() {
    //CONNECTION CODE
    AuthenticationApi.getCurrentUser().then(resp => {
        console.log(resp.data.displayName);
        if (!(resp.data.displayName)) {
            console.log("Attempting 2FA");
            AuthenticationApi.verify2FA({
                code: newToken.token
            }).then(resp => {
                console.log(`Yay, the code was accepted! ${resp.data.verified}`);
            }).then(() => {
                AuthenticationApi.getCurrentUser().then((resp) => {
                    currentUser = resp.data;

                    console.log("Logged in : " + currentUser.displayName)
                    AuthenticationApi.verifyAuthToken().then((resp) => {
                        console.log(`Got auth cookie`);
                        vrcHeaders = {
                            "User-Agent": userAgent,
                            Auth_Cookie: resp.data.token,
                        };
                        //console.log(resp.data.token)
                        var client = new WebSocketClient();

                        client.on("connectFailed", function(error) {
                            console.log("Connect Error: " + error.toString());
                        });

                        client.on("connect", function(connection) {
                            console.log("WebSocket Client Connected");
                            BOTAPIPOINT();
                            connection.on("error", function(error) {
                                console.log("Connection Error: " + error.toString());
                            });

                            connection.on("close", function() {
                                console.log("echo-protocol Connection Closed");
                                //sleep(2000);
                                client.connect(
                                    "wss://pipeline.vrchat.cloud/?authToken=" + resp.data.token,
                                    "echo-protocol",
                                    null, {
                                        "User-Agent": userAgent,
                                    }
                                );
                            });

                            //Handling incoming messages, parsing etc
                            connection.on("message", function(message) {
                                if (!message.type === "utf8") {
                                    return console.error("Message is not of type \"UTF8\"");
                                }

                                try {
                                    let parsedMessage;
                                    parsedMessage = JSON.parse(message.utf8Data);

                                    if (parsedMessage.type == "friend-online") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            HandleFriendOnline(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    } else if (parsedMessage.type == "friend-update") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            //HandleFRAdd(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    } else if (parsedMessage.type == "friend-offline") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            HandleFriendOffline(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    } else if (parsedMessage.type == "friend-delete") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            //HandleFRRemove(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    } else if (parsedMessage.type == "friend-add") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            //HandleFRAdd(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    } else if (parsedMessage.type == "notification") {
                                        parsedMessage = JSON.parse(parsedMessage.content);

                                        try {
                                            HandleNotification(parsedMessage)
                                        } catch (error) {
                                            return console.error(error);
                                        }
                                    }
                                } catch (error) {
                                    return console.error("Unprocessed request due to crappy parse: " + error);
                                }
                            });
                        });

                        client.connect(
                            "wss://pipeline.vrchat.cloud/?authToken=" + resp.data.token,
                            "echo-protocol",
                            null, {
                                "User-Agent": userAgent
                            }
                        );
                    });
                });
            })
        } else {
            console.log("Dead");
        }
    });

    // HANDLING A RECIEVED MESSAGE
    function HandleNotification(notification) {
        switch (notification.type) {
            case "requestInvite":
                //SaveAlertPending(notification);
                //AcceptJoinRequest(notification);
                break;
            case "friendRequest":
                //SaveAlertPending(notification);
                AcceptFriendRequest(notification);
                break;
        }
    }

    function HandleFriendOffline(data) {
        if (config.addons.vrcapi.toggles.blscan) {
            fetch(`http://192.168.0.235:4025/Blacklist2/${data.userId}`).then(res11 => res11.json()).then(blcheck => {
                if (blcheck.blacklisted == true) {
                    FriendsApi.unfriend(data.userId);
                    console.log(`${data.user.displayName}(USERID: ${data.userId}) been Defriended`);
                    console.log(`${data.user.displayName} been Global Blacklised by World Balancer`);
                    console.log(`REASON: ${blcheck.reason}`)
                }
            });
        }
    }

    function HandleFriendOnline(data) {
        if (config.addons.vrcapi.toggles.blscan) {
            fetch(`http://192.168.0.235:4025/Blacklist2/${data.userId}`).then(res11 => res11.json()).then(blcheck => {
                if (blcheck.blacklisted == true) {
                    FriendsApi.unfriend(data.userId);
                    console.log(`${data.user.displayName}(USERID: ${data.userId}) been Defriended`);
                    console.log(`${data.user.displayName} been Global Blacklised by World Balancer`);
                    console.log(`REASON: ${blcheck.reason}`)
                }
            });
        }
    }


    //AUTO ACCEPT FRIENDS
    function AcceptFriendRequest(data) {
        console.log("Recieved friend request from " + data.senderUsername);

        if (config.addons.vrcapi.toggles.blfr) {
            fetch(`http://192.168.0.235:4025/Blacklist2/${data.senderUserId}`).then(res11 => res11.json()).then(blcheck => {
                if (blcheck.blacklisted == true) {
                    NotificationsApi.deleteNotification(data.id);
                    NotificationsApi.clearNotifications();
                    console.log(`${data.senderUsername} been Declined`);
                    console.log(`${data.senderUsername} been Global Blacklised by World Balancer`);
                    console.log(`REASON: ${blcheck.reason}`)
                } else {
                    NotificationsApi.acceptFriendRequest(data.id).then(async () => {
                        await sleep(3000)
                        fetch(`http://localhost:9065/v4/self/get`).then(res => res.json()).then(async resp => {
                            await sleep(3000)
                            oscClient.send(
                                new Message(
                                    "/chatbox/input",
                                    `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                                    true,
                                    false
                                )
                            );
                        });
                    }).catch(e => {
                        oscClient.send(
                            new Message(
                                "/chatbox/input",
                                `Error: Cant Accept Friend Request Right Now!`,
                                true,
                                false
                            )
                        );
                    });
                }
            });
        } else {
            NotificationsApi.acceptFriendRequest(data.id).then(async () => {
                await sleep(3000)
                fetch(`http://localhost:9065/v4/self/get`).then(res => res.json()).then(async resp => {
                    await sleep(3000)
                    oscClient.send(
                        new Message(
                            "/chatbox/input",
                            `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                            true,
                            false
                        )
                    );
                });
            });
        }
    }
}

async function InvPub(req) {
    return new Promise((resolve, reject) => {
        AuthenticationApi.getCurrentUser().then((resp) => {
        currentUser = resp.data;

        //console.log(currentUser.presence.world + ":" +currentUser.presence.instance)
        var instanceid = currentUser.presence.world + ":" + currentUser.presence.instance;
        WorldsApi.getWorldInstance(currentUser.presence.world, currentUser.presence.instance).then(WorldData => {
            //console.log(WorldData.data)
            if (WorldData.data.type == 'public') {
                InviteApi.inviteUser(req.body.senderUserId, {
                        instanceId: instanceid
                    })
                    .then((resp) => {
                        const response = {
                            status: 200,
                            message: "Sended Inivte to User",
                            data: resp.data
                        };
                        resolve(response);
                    })
                    .catch(err => {
                        const response = {
                            status: err.response.status,
                            message: err.response.statusText
                        };
                        resolve(response);
                    });
            } else if (WorldData.data.ownerId == currentUser.id) {
                InviteApi.inviteUser(req.body.senderUserId, {
                        instanceId: instanceid
                    })
                    .then((resp) => {
                        const response = {
                            status: 200,
                            message: "Sended Inivte to User",
                            data: resp.data
                        };
                        resolve(response);
                    })
                    .catch(err => {
                        const response = {
                            status: err.response.status,
                            message: err.response.statusText
                        };
                        resolve(response);
                    });
            } else {
                const response = {
                    status: 403,
                    message: "NOT MY WORLD! DECLINED!"
                };
                resolve(response);
            }
        });
    });
})
}

async function GetSelf() {
    return new Promise((resolve, reject) => {
        AuthenticationApi.getCurrentUser().then(resp => {
            const response = {
                status: 200,
                data: resp.data
            };
            resolve(response);
        }).catch(e => {
            const response = {
                status: e.response.status,
                message: e.response.statusText
            };
            resolve(response);
        });
    })
}
async function GetWorldInstance(req) {
    return new Promise((resolve, reject) => {
        WorldsApi.getWorldInstance(req.body.world, req.body.instance).then(resp => {
            const response = {
                status: 200,
                data: resp.data
            };
            resolve(response);
        }).catch(e => {
            const response = {
                status: e.response.status,
                message: e.response.statusText
            };
            resolve(response);
        });
    })
}

// Function to check if the Unity package array contains Standalone Windows platform
function containsStandaloneWindowsPackage(unityPackages) {
    return unityPackages.some((package) => package.platform === 'standalonewindows') ? true : false;
}

// Function to check if the Unity package array contains Android platform
function containsAndroidPackage(unityPackages) {
    return unityPackages.some((package) => package.platform === 'android') ? true : false;
}

async function GetWorld(req) {
    return new Promise((resolve, reject) => {
        WorldsApi.getWorld(req.body.world).then(resp => {
            const hideUnityStuff = resp.data;
    
            const {
                unityPackages,
                ...detailsWithoutPackages
            } = hideUnityStuff;

            const response = {
                status: 200,
                isQuestSupported: containsAndroidPackage(resp.data.unityPackages),
                data: detailsWithoutPackages
            };
            resolve(response);
        }).catch(e => {
            const response = {
                status: e.response.status,
                message: e.response.statusText
            };
            resolve(response);
        });
    })
}

async function GetUser(req) {
    return new Promise((resolve, reject) => {
        UsersApi.getUser(req.body.userid).then(resp => {
            const response = {
                status: 200,
                data: resp.data
            };
            resolve(response);
        }).catch(e => {
            const response = {
                status: e.response.status,
                message: e.response.statusText
            };
            resolve(response);
        });
    })
}

module.exports = {
    VRCFriends,
    InvPub,
    GetSelf,
    GetWorldInstance,
    GetWorld,
    GetUser
}