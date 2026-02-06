const { Op } = require("sequelize");
const MusicQueueItem = require("../../../models/MusicQueueItem");
const useSequelize = Boolean(MusicQueueItem.sequelize);

async function addQueueItem(query) {
  return MusicQueueItem.create({ query, status: "queued" });
}

async function getPendingItems() {
  const statusFilter = useSequelize
    ? { [Op.in]: ["queued", "playing"] }
    : ["queued", "playing"];
  return MusicQueueItem.findAll({
    where: { status: statusFilter },
    order: [["id", "ASC"]]
  });
}

async function markPlaying(id) {
  return MusicQueueItem.update({ status: "playing" }, { where: { id } });
}

async function markDone(id) {
  return MusicQueueItem.update({ status: "done" }, { where: { id } });
}

async function markFailed(id) {
  return MusicQueueItem.update({ status: "failed" }, { where: { id } });
}

module.exports = {
  addQueueItem,
  getPendingItems,
  markPlaying,
  markDone,
  markFailed
};
