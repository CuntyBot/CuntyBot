const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const { wasAction } = require('../systems/moderation');

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    if (wasAction(`unban:${ban.guild.id}:${ban.user.id}`)) return;
    await sendLog(ban.guild, 'unban', {
      target: ban.user,
      title: 'Mitglied entbannt',
      description: `${ban.user.tag} wurde entbannt (außerhalb des Bots).`,
    });
  },
};
