const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const { wasAction } = require('../systems/moderation');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    // Wurde der Ban schon von /mod ban geloggt? Dann hier nicht doppelt loggen.
    if (wasAction(`ban:${ban.guild.id}:${ban.user.id}`)) return;
    await sendLog(ban.guild, 'ban', {
      description: `${ban.user.tag} wurde gebannt (außerhalb des Bots, z.B. über Discord selbst).`,
      fields: [{ name: 'User', value: `${ban.user} (\`${ban.user.id}\`)` }],
    });
  },
};
