const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const tickets = require('../systems/tickets');
const { wasAction } = require('../systems/moderation');
const logger = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const kicked = wasAction(`kick:${member.guild.id}:${member.id}`);
    await sendLog(member.guild, 'memberLeave', {
      description: `${member.user.tag} hat den Server verlassen.${kicked ? ' (gekickt)' : ''}`,
      thumbnail: member.user.displayAvatarURL(),
      fields: [{ name: 'Mitglieder gesamt', value: String(member.guild.memberCount), inline: true }],
    });
    await tickets.handleMemberLeave(member).catch((e) => logger.error('handleMemberLeave-Fehler:', e));
  },
};
