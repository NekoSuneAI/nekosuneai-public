const { DataTypes } = require('sequelize');
const sequelize = require('../Addons/db');

const Message = sequelize.define('Message', {
  role: {
    type: DataTypes.ENUM('system', 'user', 'assistant'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  }
});

module.exports = Message;