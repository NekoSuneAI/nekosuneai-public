const Message = require('./../models/Message');

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

module.exports = { addMessage, getMemory, resetMemory };