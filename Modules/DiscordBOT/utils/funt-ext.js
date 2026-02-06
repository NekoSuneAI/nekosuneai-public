const { Sequelize, DataTypes } = require('sequelize');

const config = require("../../config").config;

function createConnectionSequelize(db) {
  return new Sequelize(db, config.discord.sql.user, config.discord.sql.password, {
    host: config.discord.sql.host,
    port: config.discord.sql.port,
    dialect: config.discord.sql.dialect,
    logging: false, // Set to true to see SQL queries in console
  });
}

// Function to execute a SQL query
async function SQLQuary(db, sql, data = null) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    try {
      const result = await connection.query(sql, {
        replacements: data,
        type: Sequelize.QueryTypes.SELECT, // Use SELECT for reading queries
      });
      
      // If result is not an array, try wrapping it in an array
      if (!Array.isArray(result)) {
        resolve([result]);  // Wrap the result in an array if it's not one
      } else {
        resolve(result);
      }
    } catch (error) {
      reject(error);
    } finally {
      await connection.close(); // Ensure the connection is closed
    }
  });
}


// Function to Create SQL Table By Sequelize
async function CreateTableSequelize(db, sql, data) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    const ServersList = connection.define(sql, data);
    try {
      await connection.sync({ force: false }); // Sync the database
      resolve(true);
    } catch (error) {
      reject(false)
      console.error('Error connecting to the database:', error);
    }
  });
}

// Function to Insert SQL Row By Sequelize
async function InsertSequelize(db, sql, define, data) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    const ServersList = connection.define(sql, define);
    await ServersList.upsert(data);
    try {
      await connection.sync({ force: false }); // Sync the database
      resolve(true);
    } catch (error) {
      reject(false)
      console.error('Error connecting to the database:', error);
    }
  });
}

// Function to Insert SQL Row By Sequelize
async function GetSequelize(db, sql, define, data) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    const ServersList = connection.define(sql, define);
    resolve(await ServersList.findAll(data));
    try {
      await connection.sync({ force: false }); // Sync the database
      //resolve(true);
    } catch (error) {
      reject(false)
      console.error('Error connecting to the database:', error);
    }
  });
}

// Function to Update SQL Row By Sequelize
async function UpdateSequelize(db, sql, define, data, from) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    const ServersList = connection.define(sql, define);
    await ServersList.update(data, from);
    try {
      await connection.sync({ force: false }); // Sync the database
      resolve(true);
    } catch (error) {
      reject(false)
      console.error('Error connecting to the database:', error);
    }
  });
}

// Function to Delete SQL Row By Sequelize
async function DeleteSequelize(db, sql, define, data) {
  const connection = createConnectionSequelize(db);
  return new Promise(async (resolve, reject) => {
    const ServersList = connection.define(sql, define);
    await ServersList.destroy(data);
    try {
      await connection.sync({ force: false }); // Sync the database
      resolve(true);
    } catch (error) {
      reject(false)
      console.error('Error connecting to the database:', error);
    }
  });
}

// The following functions now use the SQLQuery function

async function getBlacklistUsers(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `profile_blacklist`, 
  {
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    active: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    where: { user_id: guildID },
  });
}

async function getGuildToggle(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_command_toggles`, 
  {
    guild_id: {
      type: Sequelize.STRING, // Change the data type if necessary
      primaryKey: true,
    },
    levelToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    musicToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    globalToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    tempToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    joinroleToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    AntiSpamToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    AntiAltToggle: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    where: { guild_id: guildID },
  });
}

async function getGuildChannels(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_channels`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  welcome_id: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
  leave_id: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
  levelChannel: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  globalchannelid: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  tempvccatid: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  tempvchubid: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  loggerChannel: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuildSettings(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  prefix: {
    type: Sequelize.STRING,
    defaultValue: '/',
  },
  language: {
    type: Sequelize.STRING,
    defaultValue: 'en',
  },
  welcome_msg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'Welcome to Server {{NAME}}',
  },
  leave_msg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'Good Bye {{NAME}}',
  },
 	joinleavebg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'https://cdn.discordapp.com/attachments/731224782665678990/924659966290305054/background.png',
  },
  tempvcamount: {
    type: Sequelize.INTEGER,
    defaultValue: '0',
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuildRoles(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_roles`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  autorole_id: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuildSettingsAlerts() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_alerts`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  chisupdatealert: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  alloyupdatealert: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  vimmalert: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  helpiecasteralert: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  pridevralert: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
});
}

async function getGuildSettingsAlertsNekoSune() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_alerts_nekosunevr`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  nekosuneupdates: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunemedaltv: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunesocials: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunelivestreams: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
});
}

async function getGuildSettingsSafety(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_safeties`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  AntiAltDays: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  AntiAltOptions: {
    type: Sequelize.STRING,
    defaultValue: null,
  },
  AntiSpamWarn: {
    type: Sequelize.STRING,
    defaultValue: '3',
  },
  AntiSpamMute: {
    type: Sequelize.STRING,
    defaultValue: '6',
  },
  AntiSpamKick: {
    type: Sequelize.STRING,
    defaultValue: '9',
  },
  AntiSpamBan: {
    type: Sequelize.STRING,
    defaultValue: '12',
  },
  AntiSpamWarnMsg: {
    type: Sequelize.STRING,
    defaultValue: 'Stop spamming!',
  },
  AntiSpamMuteMsg: {
    type: Sequelize.STRING,
    defaultValue: 'You have been muted for spamming!',
  },
  AntiSpamKickMsg: {
    type: Sequelize.STRING,
    defaultValue: 'You have been kicked for spamming!',
  },
  AntiSpamBanMsg: {
    type: Sequelize.STRING,
    defaultValue: 'You have been banned for spamming!',
  },
  AntiSpamUnMuteTimer: {
    type: Sequelize.STRING,
    defaultValue: '60',
  },
  AntiSpamVerbose: {
    type: Sequelize.STRING,
    defaultValue: 'true',
  },
  AntiSpamRemoveMessages: {
    type: Sequelize.STRING,
    defaultValue: 'true',
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getProfileRoles(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `profile_rank`, 
  {
    userid: {
      type: DataTypes.STRING(30),
      allowNull: true,
      primaryKey: true,
    },
    user_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'user',
    },
    isDonator: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isPremium: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isLegend: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isMega: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isNitro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isTwitchSub: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isVimmSub: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isTrovoSub: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isThetaSub: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isKickSub: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isMonthSupporter: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isADRemover: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isBetaTesters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    monthlytime: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '00-00-0000-00:00',
    },
    monthlytimemc: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '00-00-0000-00:00',
    },
    isDevAdmin: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    where: { userid: guildID },
  });
}

async function getBlacklistServers(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_blacklist`, 
  {
  guild_id: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  message: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  active: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuild(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings`, 
  {
  guild_id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  prefix: {
    type: Sequelize.STRING,
    defaultValue: '/',
  },
  language: {
    type: Sequelize.STRING,
    defaultValue: 'en',
  },
  welcome_msg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'Welcome to Server {{NAME}}',
  },
  leave_msg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'Good Bye {{NAME}}',
  },
 	joinleavebg: {
    type: Sequelize.STRING,
    collate: 'utf8mb4_bin',
    defaultValue: 'https://cdn.discordapp.com/attachments/731224782665678990/924659966290305054/background.png',
  },
  tempvcamount: {
    type: Sequelize.INTEGER,
    defaultValue: '0',
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuildAutoPostURL(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_autopost_urls`, 
  {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  guild_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  enabled: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
},
  {
    where: { guild_id: guildID },
  });
}

async function getGuildAutoPost(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_autoposts`, 
  {
  id: {
    type: Sequelize.STRING(500), // Change the data type if necessary
    primaryKey: true,
  },
  chis: {
    type: Sequelize.STRING(500),
    defaultValue: '0',
  },
  alloy: {
    type: Sequelize.STRING(500),
    defaultValue: '0',
  },
  vimm: {
    type: Sequelize.STRING(500),
    defaultValue: '0',
  },
  helpiecaster: {
    type: Sequelize.STRING(500),
    defaultValue: '0',
  },
  pridevr: {
    type: Sequelize.STRING(500),
    defaultValue: '0',
  },
},
  {
    where: { id: guildID },
  });
}



async function getGuildAutoPostNekoSune(guildID) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_settings_autopost_nekosunevr`, {
  id: {
    type: Sequelize.STRING, // Change the data type if necessary
    primaryKey: true,
  },
  nekosuneupdates: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunemedaltv: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunesocials: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
  nekosunelivestreams: {
    type: Sequelize.STRING,
    defaultValue: '0',
  },
},
  {
    where: { id: guildID },
  });
}



async function getBlacklistServersList() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `guild_blacklist`, 
  {
  guild_id: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  message: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  active: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
},
  {
    where: { active: '1' },
  });
}

async function getBlacklistUsersList() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `profile_blacklist`, 
  {
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  message: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  active: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
},
  {
    where: { active: '1' },
  });
}

async function getGlobalChatSettings(userid) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `global_chat_settings`, 
  {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  userid: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  isWhitelistedLinks: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
},
  {
    where: { userid: userid },
  });
}

async function getGlobalChatBlockedLinks() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `global_chat_blockedlinks`,
  {
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    primaryKey: true,
  },
  blocked: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});
}

async function getGlobalChatAllowedLinks() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `global_chat_allowedlinks`, 
  {
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    primaryKey: true,
  },
  allowed: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});
}

async function getGlobalBOTSettings() {
  return GetSequelize(
  config.datacfg.sql.database, 
  `bot_settings`, 
  {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  walletnodes_hephp: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  subredditUrlChis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  threespeakUrlchis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  twitterUrlchis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  ytUrlchis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  hivepeakdchis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  hivechisuploads: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  blurtchisuploads: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  steemchisuploads: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  dtube: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  oddyseevideochis: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  subredditUrlAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  threespeakUrlAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  twitterUrlAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  ytUrlAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  hiveAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  blurtAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  steemAlloy: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  hivepeakdhelpiecaster: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  hivepeakdvimm: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
},
  {
    where: { id: '1' },
  });
}

async function getPlayersPoints(userid) {
  return GetSequelize(
  config.datacfg.sql.database, 
  `channels_levels`, 
  {
    username: {
      type: DataTypes.STRING(255),
      defaultValue: null,
    },
    discordid: {
      type: DataTypes.STRING(255),
      defaultValue: null,
      primaryKey: true,
    },
    twitch: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    dlive: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    vimm: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovo: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovoid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtube: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtubechannelid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    level: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    level_xp: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    points: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    backgroundrank: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: 'https://i.imgur.com/SpcEOfc.jpg',
    },
    bank: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    daily: {
      type: DataTypes.BIGINT,
      defaultValue: null,
    },
  },
  {
    where: { discordid: userid },
  });
}

async function updatePlayersLevel(xp, level, userid) {
  return UpdateSequelize(
  config.datacfg.sql.database, 
  `channels_levels`,
  {
    username: {
      type: DataTypes.STRING(255),
      defaultValue: null,
    },
    discordid: {
      type: DataTypes.STRING(255),
      defaultValue: null,
      primaryKey: true,
    },
    twitch: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    dlive: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    vimm: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovo: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovoid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtube: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtubechannelid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    level: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    level_xp: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    points: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    backgroundrank: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: 'https://i.imgur.com/SpcEOfc.jpg',
    },
    bank: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    daily: {
      type: DataTypes.BIGINT,
      defaultValue: null,
    },
  }, 
  { level_xp: Number(xp), level: Number(level) } ,
  {
    where: { discordid: userid },
  });
}

async function updatePlayersPoints(points, userid) {
  return UpdateSequelize(
  config.datacfg.sql.database, 
  `channels_levels`,
  {
    username: {
      type: DataTypes.STRING(255),
      defaultValue: null,
    },
    discordid: {
      type: DataTypes.STRING(255),
      defaultValue: null,
      primaryKey: true,
    },
    twitch: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    dlive: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    vimm: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovo: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovoid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtube: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtubechannelid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    level: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    level_xp: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    points: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    backgroundrank: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: 'https://i.imgur.com/SpcEOfc.jpg',
    },
    bank: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    daily: {
      type: DataTypes.BIGINT,
      defaultValue: null,
    },
  }, 
  { points: Number(points) } ,
  {
    where: { discordid: userid },
  });
}

async function createPlayersPoints(name, userid) {
  return InsertSequelize(
  config.datacfg.sql.database, 
  `channels_levels`, 
  {
    username: {
      type: DataTypes.STRING(255),
      defaultValue: null,
    },
    discordid: {
      type: DataTypes.STRING(255),
      defaultValue: null,
      primaryKey: true,
    },
    twitch: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    dlive: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    vimm: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovo: {
      type: DataTypes.STRING(255),
      defaultValue: 'N/A',
    },
    trovoid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtube: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    youtubechannelid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'N/A',
    },
    level: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    level_xp: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    points: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    backgroundrank: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: 'https://i.imgur.com/SpcEOfc.jpg',
    },
    bank: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
    },
    daily: {
      type: DataTypes.BIGINT,
      defaultValue: null,
    },
  },
  {
        level_xp: '0',
        level: '0',
        points: '100',
        discordid: `${userid}`,
        username: `${name}`
  });
}

async function postAllServersChisUpdates(client, embed) {
        const dbprefix = await getGuildSettingsAlertsNekoSune().catch(console.error);
        dbprefix.forEach(element => {

            console.log(element)

            if (element.nekosuneupdates == 0) return;
            client.guilds.cache.map(guild => {
                var data = guild.channels.cache.find(channel => channel.id === element.nekosuneupdates);
                if (data == undefined) {
                    return;
                } else {
                    const messageChannel = client.channels.cache.get(data.id);
                    messageChannel.send({
                        embeds: [embed]
                    }).then(() => {
                        console.log(`Sent message for new post ${guild.name}`);
                    }).catch(err => {
                        console.log(embed, err);
                    });
                }
            });
        });
  }
  
async function postAllServersChisMedalTV(client, embed) {
        const dbprefix = await getGuildSettingsAlertsNekoSune().catch(console.error);
        dbprefix.forEach(element => {

            if (element.nekosunemedaltv == 0) return;
            client.guilds.cache.map(guild => {
                var data = guild.channels.cache.find(channel => channel.id === element.nekosunemedaltv);
                if (data == undefined) {
                    return;
                } else {
                    const messageChannel = client.channels.cache.get(data.id);
                    messageChannel.send({
                        embeds: [embed]
                    }).then(() => {
                        console.log(`Sent message for new post ${guild.name}`);
                    }).catch(err => {
                        console.log(embed, err);
                    });
                }
            });
        });
  }
  
async function postAllServersChisSocials(client, embed) {
        const dbprefix = await getGuildSettingsAlertsNekoSune().catch(console.error);
        dbprefix.forEach(element => {

            if (element.nekosunesocials == 0) return;
            client.guilds.cache.map(guild => {
                var data = guild.channels.cache.find(channel => channel.id === element.nekosunesocials);
                if (data == undefined) {
                    return;
                } else {
                    const messageChannel = client.channels.cache.get(data.id);
                    messageChannel.send({
                        embeds: [embed]
                    }).then(() => {
                        console.log(`Sent message for new post ${guild.name}`);
                    }).catch(err => {
                        console.log(embed, err);
                    });
                }
            });
        });
  }
  
async function postAllServersChisLivestreams(client, embed) {
        const dbprefix = await getGuildSettingsAlertsNekoSune().catch(console.error);
        dbprefix.forEach(element => {

            if (element.nekosunelivestreams == 0) return;
            client.guilds.cache.map(guild => {
                var data = guild.channels.cache.find(channel => channel.id === element.nekosunelivestreams);
                if (data == undefined) {
                    return;
                } else {
                    const messageChannel = client.channels.cache.get(data.id);
                    messageChannel.send({
                        embeds: [embed]
                    }).then(() => {
                        console.log(`Sent message for new post ${guild.name}`);
                    }).catch(err => {
                        console.log(embed, err);
                    });
                }
            });
        });
  }
  
async function postAllServersPrideVR(client, embed) {
        const dbprefix = await getGuildSettingsAlerts().catch(console.error);
        dbprefix.forEach(element => {

            if (element.pridevralert == 0) return;
            client.guilds.cache.map(guild => {
                var data = guild.channels.cache.find(channel => channel.id === element.pridevralert);
                if (data == undefined) {
                    return;
                } else {
                    const messageChannel = client.channels.cache.get(data.id);
                    messageChannel.send({
                        embeds: [embed]
                    }).then(() => {
                        console.log(`Sent message for new post ${guild.name}`);
                    }).catch(err => {
                        console.log(embed, err);
                    });
                }
            });
        });
  }

  async function postAllServersAlloy(client, embed) {
    const dbprefix = await getGuildSettingsAlerts().catch(console.error);
    dbprefix.forEach(element => {

        if (element.alloyupdatealert == 0) return;
        client.guilds.cache.map(guild => {
          var data = guild.channels.cache.find(channel => channel.id === element.alloyupdatealert);
          if (data == undefined) {
              return;
          } else {
              const messageChannel = client.channels.cache.get(data.id);
              messageChannel.send({
                  embeds: [embed]
              }).then(() => {
                   console.log(`Sent message for new post ${guild.name}`);
              }).catch(err => {
                   console.log(embed, err);
              });
          }
        });
    });
  }
  
  async function postAllServersVIMM(client, embed) {
    const dbprefix = await getGuildSettingsAlerts().catch(console.error);
    dbprefix.forEach(element => {

        if (element.vimmalert == 0) return;
        client.guilds.cache.map(guild => {
          var data = guild.channels.cache.find(channel => channel.id === element.vimmalert);
          if (data == undefined) {
              return;
          } else {
              const messageChannel = client.channels.cache.get(data.id);
              messageChannel.send({
                  embeds: [embed]
              }).then(() => {
                   console.log(`Sent message for new post ${guild.name}`);
              }).catch(err => {
                   console.log(embed, err);
              });
          }
      });
    });
  }
  
async function postAllServersHelpieCaster(client, embed) {
    const dbprefix = await getGuildSettingsAlerts().catch(console.error);
    dbprefix.forEach(element => {

        if (element.helpiecasteralert == 0) return;
        client.guilds.cache.map(guild => {
          var data = guild.channels.cache.find(channel => channel.id === element.helpiecasteralert);
          if (data == undefined) {
              return;
          } else {
              const messageChannel = client.channels.cache.get(data.id);
              messageChannel.send({
                  embeds: [embed]
              }).then(() => {
                   console.log(`Sent message for new post ${guild.name}`);
              }).catch(err => {
                   console.log(embed, err);
              });
          }
        });
    });
}

module.exports = {
    SQLQuary,
    getGuildAutoPost,
    getGuildAutoPostURL,
    getGuildRoles,
    createConnectionSequelize,
    CreateTableSequelize,
    GetSequelize,
    updatePlayersLevel,
    InsertSequelize, 
    UpdateSequelize,
    DeleteSequelize,
    getGuildChannels,
    getBlacklistUsers,
    getGuildToggle,
    getGuildSettings,
    getProfileRoles,
    getBlacklistServers,
    getGuild,
    getBlacklistServersList,
    getBlacklistUsersList,
    getGuildSettingsSafety,
    getGuildSettingsAlerts,
    getGuildSettingsAlertsNekoSune,
    postAllServersChisUpdates,
    postAllServersChisMedalTV,
    postAllServersChisSocials,
    postAllServersChisLivestreams,
    postAllServersAlloy,
    postAllServersVIMM,
    postAllServersHelpieCaster,
    getGlobalBOTSettings,
    getGlobalChatSettings,
    getGlobalChatBlockedLinks,
    getGlobalChatAllowedLinks,
    getPlayersPoints,
    updatePlayersPoints,
    createPlayersPoints,
    postAllServersPrideVR,
    getGuildAutoPostNekoSune
}
