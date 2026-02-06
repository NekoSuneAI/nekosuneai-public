const { DataTypes } = require("sequelize");
const { sequelize, dbInitError } = require("../AI/Addons/DB/db");

let MusicQueueItem;

if (sequelize) {
  MusicQueueItem = sequelize.define("MusicQueueItem", {
    query: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("queued", "playing", "done", "failed"),
      allowNull: false,
      defaultValue: "queued"
    }
  });
} else {
  let items = [];
  let nextId = 1;
  console.warn("[MusicQueue] SQLite unavailable; using in-memory queue only.", dbInitError?.message || dbInitError);

  MusicQueueItem = {
    create: async ({ query, status }) => {
      const entry = { id: nextId++, query, status: status || "queued" };
      items.push(entry);
      return entry;
    },
    findAll: async ({ where, order } = {}) => {
      let result = items.slice();
      if (where && where.status) {
        const allowed = Array.isArray(where.status) ? where.status : [where.status];
        result = result.filter(item => allowed.includes(item.status));
      }
      if (order && order[0] && order[0][0] === "id" && order[0][1] === "ASC") {
        result = result.sort((a, b) => a.id - b.id);
      }
      return result;
    },
    update: async (data, options) => {
      const where = options?.where || {};
      if (where.id == null) return;
      const item = items.find(entry => entry.id === where.id);
      if (!item) return;
      Object.assign(item, data);
    }
  };
}

module.exports = MusicQueueItem;
