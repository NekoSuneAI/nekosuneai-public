const Message = require('../../../models/Message');
const { sequelize } = require('./db');
const IDLE_CLEAR_MS = 10 * 60 * 1000;
let idleTimer = null;
let dbSynced = false;

async function ensureSynced() {
  if (!sequelize || dbSynced) return;
  try {
    await sequelize.sync();
    dbSynced = true;
  } catch (err) {
    console.warn('[Memory] Failed to sync sqlite, falling back to memory:', err.message || err);
  }
}

async function addMessage(role, content) {
  await ensureSynced();
  return Message.create({ role, content });
}

async function getMemory(limit = 50) {
  await ensureSynced();
  return Message.findAll({
    order: [['id', 'ASC']],
    limit
  });
}

async function resetMemory() {
  await ensureSynced();
  await Message.destroy({ where: {} });
}

function scheduleIdleClear() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(async () => {
    try {
      await resetMemory();
      console.log('[Memory] Cleared after idle timeout.');
    } catch (err) {
      console.error('[Memory] Failed to clear after idle timeout:', err.message || err);
    } finally {
      scheduleIdleClear();
    }
  }, IDLE_CLEAR_MS);
}

function markMemoryActivity() {
  scheduleIdleClear();
}

scheduleIdleClear();

module.exports = { addMessage, getMemory, resetMemory, markMemoryActivity };
