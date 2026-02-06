const { DataTypes } = require('sequelize');
const { sequelize, dbInitError } = require('../AI/Addons/DB/db');

let Message;

if (sequelize) {
  Message = sequelize.define('Message', {
    role: {
      type: DataTypes.ENUM('system', 'user', 'assistant'),
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  });
} else {
  let messages = [];
  let nextId = 1;
  console.warn('[Memory] SQLite unavailable; using in-memory store only.', dbInitError?.message || dbInitError);

  Message = {
    create: async ({ role, content }) => {
      const entry = { id: nextId++, role, content };
      messages.push(entry);
      return entry;
    },
    findAll: async ({ order, limit } = {}) => {
      let result = messages.slice();
      if (order && order[0] && order[0][0] === 'id' && order[0][1] === 'DESC') {
        result = result.reverse();
      }
      if (typeof limit === 'number') {
        result = result.slice(0, Math.max(0, limit));
      }
      return result;
    },
    destroy: async () => {
      messages = [];
    }
  };
}

module.exports = Message;
