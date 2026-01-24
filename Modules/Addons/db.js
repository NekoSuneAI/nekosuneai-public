const { Sequelize } = require('sequelize');
const path = require('path');
const { config } = require("../config");

let sequelize = null;
let dbInitError = null;

try {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', '..', 'config', `memory-${config.addons.AI.GPTText.gptModel}.sqlite`),
    logging: false
  });
} catch (err) {
  dbInitError = err;
  console.warn('[DB] SQLite unavailable. Memory store will run in-memory only.', err.message || err);
}

module.exports = { sequelize, dbInitError };
