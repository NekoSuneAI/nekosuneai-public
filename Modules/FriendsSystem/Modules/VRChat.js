const { config, packageJson } = require('../../config')

const { BOTAPIPOINT } = require('./Web')

const WebSocket = require('ws')
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
const { VRChat, VRChatError } = require('vrchat') //npm vrchat
//require('log-timestamp');                 //npm log-timestamp
const twofactor = require('node-2fa')
const fetch = global.fetch
const { sendToWebhookchat } = require('../../AUTOAI/AddonsModules/API/Webhooks')

function requireFetch () {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 20+ or install a fetch polyfill.')
  }
  return fetch
}

const { Client, Message } = require('node-osc')

let userAgent = `NekoSuneAIBOT/${packageJson.version} ${config.VRCACC.username}`
const vrchat = new VRChat({
  baseUrl: "https://api.vrchat.cloud/api/1",
  application: {
    name: 'NekoSuneAI-AIBOT',
    version: packageJson.version,
    contact: 'https://github.com/NekoSuneAI/nekosuneai-public'
  },
  authentication: {
    credentials: async () => ({
      username: config.VRCACC.username,
      password: config.VRCACC.password,
      twoFactorCode: generateTwoFactorCode()
    })
  }
})

let currentUser

const oscClient = new Client(
  config.VRCACC.OSC_TARGET_ADDRESS,
  config.VRCACC.OSC_TARGET_PORT
)

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateTwoFactorCode () {
  if (!config.VRCACC.twofatoken) return ''
  const token = twofactor.generateToken(config.VRCACC.twofatoken)
  return token ? token.token : ''
}

async function getCurrentUserWithLogin () {
  const resp = await vrchat.getCurrentUser({ throwOnError: true }).catch(async error => {
    if (!(error instanceof VRChatError) || error.statusCode !== 401) throw error
    return vrchat.login({
      username: config.VRCACC.username,
      password: config.VRCACC.password,
      twoFactorCode: async () => generateTwoFactorCode(),
      throwOnError: true
    })
  })
  return resp.data
}

async function safeBlacklistCheck (userId) {
  try {
    const url = `https://nekologger.nekosunevr.co.uk/v5/games/api/vrchat/yoinker/check/${userId}`
    const fetchImpl = requireFetch()
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return data
  } catch (error) {
    console.log('[yoinker check] skipped:', error.message || error)
    return null
  }
}

async function VRCFriends () {
  let authToken
  try {
    currentUser = await getCurrentUserWithLogin()
    if (!currentUser || !currentUser.displayName) {
      console.log('Dead')
      return
    }
    console.log('Logged in : ' + currentUser.displayName)
    const authResp = await vrchat.verifyAuthToken({ throwOnError: true })
    authToken = authResp.data.token
    if (!authToken) throw new Error('Missing auth token')
    console.log('Got auth cookie')
  } catch (error) {
    console.error('[VRChat auth] failed:', error.message || error)
    return
  }

  await autoAcceptPendingFriendRequests()

  vrcHeaders = {
    'User-Agent': userAgent,
    Auth_Cookie: authToken
  }
  //console.log(authToken)
  const wsUrl = 'wss://pipeline.vrchat.cloud/?authToken=' + authToken

  const connectWebSocket = () => {
    const connection = new WebSocket(wsUrl, 'echo-protocol', {
      headers: {
        'User-Agent': userAgent
      }
    })

    connection.on('open', () => {
      console.log('WebSocket Client Connected')
      BOTAPIPOINT()
    })

    connection.on('error', error => {
      console.log('Connection Error: ' + error.toString())
    })

    connection.on('close', () => {
      console.log('echo-protocol Connection Closed')
      setTimeout(connectWebSocket, 2000)
    })

    // Handling incoming messages, parsing etc
    connection.on('message', data => {
      const payload = typeof data === 'string' ? data : data.toString()
      try {
        let parsedMessage = JSON.parse(payload)

        if (parsedMessage.type == 'friend-online') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            HandleFriendOnline(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        } else if (parsedMessage.type == 'friend-update') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            //HandleFRAdd(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        } else if (parsedMessage.type == 'friend-offline') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            HandleFriendOffline(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        } else if (parsedMessage.type == 'friend-delete') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            //HandleFRRemove(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        } else if (parsedMessage.type == 'friend-add') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            //HandleFRAdd(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        } else if (parsedMessage.type == 'notification') {
          parsedMessage = JSON.parse(parsedMessage.content)

          try {
            HandleNotification(parsedMessage)
          } catch (error) {
            return console.error(error)
          }
        }
      } catch (error) {
        return console.error(
          'Unprocessed request due to crappy parse: ' + error
        )
      }
    })
  }

  connectWebSocket()

  // HANDLING A RECIEVED MESSAGE
  function HandleNotification (notification) {
    switch (notification.type) {
      case 'requestInvite':
        //SaveAlertPending(notification);
        //AcceptJoinRequest(notification);
        break
      case 'friendRequest':
        //SaveAlertPending(notification);
        AcceptFriendRequest(notification)
        break
    }
  }

  async function HandleFriendOffline (data) {
    if (config.addons.vrcapi.toggles.blscan) {
      const blcheck = await safeBlacklistCheck(data.userId)
      if (blcheck && blcheck.blacklisted == true) {
        try {
          await vrchat.unfriend({
            path: { userId: data.userId },
            throwOnError: true
          })
          console.log(
            `${data.user.displayName}(USERID: ${data.userId}) been Defriended`
          )
          console.log(
            `${data.user.displayName} been Global Blacklised by NekoSune Community`
          )
          console.log(`REASON: ${blcheck.reason}`)
        } catch (error) {
          console.error('[VRChat] unfriend failed:', error?.message || error)
        }
      }
    }
  }

  async function HandleFriendOnline (data) {
    if (config.addons.vrcapi.toggles.blscan) {
      const blcheck = await safeBlacklistCheck(data.userId)
      if (blcheck && blcheck.blacklisted == true) {
        try {
          await vrchat.unfriend({
            path: { userId: data.userId },
            throwOnError: true
          })
          console.log(
            `${data.user.displayName}(USERID: ${data.userId}) been Defriended`
          )
          console.log(
            `${data.user.displayName} been Global Blacklised by NekoSune Community`
          )
          console.log(`REASON: ${blcheck.reason}`)
        } catch (error) {
          console.error('[VRChat] unfriend failed:', error?.message || error)
        }
      }
    }
  }

  //AUTO ACCEPT FRIENDS
  async function AcceptFriendRequest (data) {
    console.log('Recieved friend request from ' + data.senderUsername)

    if (config.addons.vrcapi.toggles.blfr) {
      const blcheck = await safeBlacklistCheck(data.senderUserId)
      if (blcheck && blcheck.blacklisted == true) {
        await vrchat.deleteNotification({
          path: { notificationId: data.id },
          throwOnError: true
        })
        await vrchat.clearNotifications({ throwOnError: true })
        console.log(`${data.senderUsername} been Declined`)
        console.log(
          `${data.senderUsername} been Global Blacklised by NekoSune Community`
        )
        console.log(`REASON: ${blcheck.reason}`)
        return
      }
      try {
        await vrchat.acceptFriendRequest({
          path: { notificationId: data.id },
          throwOnError: true
        })
        console.log(`Friend Request Accepted on ${data.senderUsername}`)
        await sleep(3000)
        requireFetch()(`http://localhost:9065/v4/self/get`)
          .then(res => res.json())
          .then(async resp => {
            await sleep(3000)
            oscClient.send(
              new Message(
                '/chatbox/input',
                `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                true,
                false
              )
            )
          })
      } catch (e) {
        console.error('[VRChat] acceptFriendRequest failed:', e?.message || e)
        oscClient.send(
          new Message(
            '/chatbox/input',
            `Error: Cant Accept Friend Request Right Now!`,
            true,
            false
          )
        )
      }
    } else {
      try {
        await vrchat.acceptFriendRequest({
          path: { notificationId: data.id },
          throwOnError: true
        })
        await sleep(3000)
        requireFetch()(`http://localhost:9065/v4/self/get`)
          .then(res => res.json())
          .then(async resp => {
            await sleep(3000)
            oscClient.send(
              new Message(
                '/chatbox/input',
                `Thank You for Friend Request ${data.senderUsername}, now i have over ${resp.data.friends.length} Friends`,
                true,
                false
              )
            )
          })
      } catch (e) {
        console.error('[VRChat] acceptFriendRequest failed:', e?.message || e)
        oscClient.send(
          new Message(
            '/chatbox/input',
            `Error: Cant Accept Friend Request Right Now!`,
            true,
            false
          )
        )
      }
    }
  }
}

async function autoAcceptPendingFriendRequests () {
  try {
    if (typeof vrchat.getNotifications !== 'function') {
      console.warn('[VRChat] getNotifications not available; skipping pending friend requests.')
      return
    }
    const resp = await vrchat.getNotifications({ throwOnError: true })
    const notifications = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : []
    const pending = notifications.filter(n => n && n.type === 'friendRequest')
    if (pending.length === 0) {
      return
    }

    let accepted = 0
    for (const notification of pending) {
      try {
        await vrchat.acceptFriendRequest({
          path: { notificationId: notification.id },
          throwOnError: true
        })
        accepted += 1
      } catch (error) {
        console.error('[VRChat] auto-accept failed:', error?.message || error)
      }
    }

    if (accepted > 0) {
      const message = 'omgh i have so many friends pending, sorry for waiting so long be accepted.'
      try {
        oscClient.send(new Message('/chatbox/input', message, true, false))
      } catch (error) {
        console.error('[VRChat] OSC message failed:', error?.message || error)
      }
      try {
        await sendToWebhookchat(message)
      } catch (error) {
        console.error('[VRChat] Discord message failed:', error?.message || error)
      }
      console.log(`[VRChat] Auto-accepted ${accepted} pending friend request(s).`)
    }
  } catch (error) {
    console.error('[VRChat] Failed to scan pending friend requests:', error?.message || error)
  }
}

async function InvPub (req) {
  try {
    currentUser = await getCurrentUserWithLogin()

    //console.log(currentUser.presence.world + ":" +currentUser.presence.instance)
    var instanceid =
      currentUser.presence.world + ':' + currentUser.presence.instance
    const WorldData = await vrchat.getWorldInstance(
      currentUser.presence.world,
      currentUser.presence.instance,
      { throwOnError: true }
    )
    //console.log(WorldData.data)
    if (WorldData.data.type == 'public' || WorldData.data.ownerId == currentUser.id) {
      const resp = await vrchat.inviteUser(
        req.body.senderUserId,
        { instanceId: instanceid },
        { throwOnError: true }
      )
      return {
        status: 200,
        message: 'Sended Inivte to User',
        data: resp.data
      }
    }

    return {
      status: 403,
      message: 'NOT MY WORLD! DECLINED!'
    }
  } catch (err) {
    return {
      status: err.response?.status || 500,
      message: err.response?.statusText || err.message || 'VRChat error'
    }
  }
}

async function GetSelf () {
  try {
    const data = await getCurrentUserWithLogin()
    return {
      status: 200,
      data
    }
  } catch (e) {
    return {
      status: e.response?.status || 500,
      message: e.response?.statusText || e.message || 'VRChat error'
    }
  }
}
async function GetWorldInstance (req) {
  try {
    const resp = await vrchat.getWorldInstance(
      req.body.world,
      req.body.instance,
      { throwOnError: true }
    )
    return {
      status: 200,
      data: resp.data
    }
  } catch (e) {
    return {
      status: e.response?.status || 500,
      message: e.response?.statusText || e.message || 'VRChat error'
    }
  }
}

// Function to check if the Unity package array contains Standalone Windows platform
function containsStandaloneWindowsPackage (unityPackages) {
  return unityPackages.some(package => package.platform === 'standalonewindows')
    ? true
    : false
}

// Function to check if the Unity package array contains Android platform
function containsAndroidPackage (unityPackages) {
  return unityPackages.some(package => package.platform === 'android')
    ? true
    : false
}

async function GetWorld (req) {
  try {
    const resp = await vrchat.getWorld(req.body.world, { throwOnError: true })
    const hideUnityStuff = resp.data

    const { unityPackages, ...detailsWithoutPackages } = hideUnityStuff

    return {
      status: 200,
      isQuestSupported: containsAndroidPackage(resp.data.unityPackages),
      data: detailsWithoutPackages
    }
  } catch (e) {
    return {
      status: e.response?.status || 500,
      message: e.response?.statusText || e.message || 'VRChat error'
    }
  }
}

async function GetUser (req) {
  try {
    const resp = await vrchat.getUser(req.body.userid, { throwOnError: true })
    return {
      status: 200,
      data: resp.data
    }
  } catch (e) {
    return {
      status: e.response?.status || 500,
      message: e.response?.statusText || e.message || 'VRChat error'
    }
  }
}

module.exports = {
  VRCFriends,
  InvPub,
  GetSelf,
  GetWorldInstance,
  GetWorld,
  GetUser
}
