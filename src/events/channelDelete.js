const { Events } = require('discord.js');
const tickets = require('../systems/tickets');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    await tickets.handleChannelDelete(channel).catch((e) => logger.error('channelDelete-Fehler:', e));
  },
};
