const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const { truncate } = require('../utils/helpers');

module.exports = {
  name: Events.MessageUpdate,
  async execute(before, after) {
    if (!after.guild || after.author?.bot || before.content === after.content) return;
    await sendLog(after.guild, 'messageEdit', {
      description: `✏️ Nachricht von ${after.author} in ${after.channel} bearbeitet. [Zur Nachricht](${after.url})`,
      fields: [
        { name: 'Vorher', value: truncate(before.content || '*leer*', 900) },
        { name: 'Nachher', value: truncate(after.content || '*leer*', 900) },
      ],
    });
  },
};
