const { Events } = require('discord.js');
const { assignJoinRoles } = require('../systems/autoroles');
const { sendLog } = require('../systems/logging');
const { ts } = require('../utils/helpers');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await assignJoinRoles(member);
    await sendLog(member.guild, 'memberJoin', {
      description: `${member} ist dem Server beigetreten.`,
      thumbnail: member.user.displayAvatarURL(),
      fields: [
        { name: 'Account erstellt', value: ts(member.user.createdTimestamp, 'R'), inline: true },
        { name: 'Mitglieder gesamt', value: String(member.guild.memberCount), inline: true },
      ],
    });
  },
};
