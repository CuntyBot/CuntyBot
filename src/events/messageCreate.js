const { Events } = require('discord.js');
const { handleMessage } = require('../systems/xp');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try { await handleMessage(message); } catch (e) { logger.error('Text-XP-Fehler:', e); }
  },
};
