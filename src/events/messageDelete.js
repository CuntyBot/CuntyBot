const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const { truncate } = require('../utils/helpers');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    await sendLog(message.guild, 'messageDelete', {
      description: `🗑️ Nachricht von ${message.author ?? 'Unbekannt'} in ${message.channel} gelöscht.`,
      fields: [{ name: 'Inhalt', value: truncate(message.content || '*Kein Text im Cache (z.B. Bild/Embed oder zu alt)*', 1000) }],
    });
  },
};
