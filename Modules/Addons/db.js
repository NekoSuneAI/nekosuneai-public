const { Sequelize } = require('sequelize');
const path = require('path');
const { config } = require("../config");

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', '..', 'config', `memory-${config.addons.AI.GPTText.gptModel}.sqlite`),
  logging: false
});

module.exports = sequelize;