const Message = require('../../../models/Message');
const IDLE_CLEAR_MS = 10 * 60 * 1000;
let idleTimer = null;

async function addMessage(role, content) {
  return Message.create({ role, content });
}

async function getMemory(limit = 50) {
  return Message.findAll({
    order: [['id', 'ASC']],
    limit
  });
}

async function resetMemory() {
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
