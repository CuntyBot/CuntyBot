const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const tickets = require('../systems/tickets');
const { wasAction } = require('../systems/moderation');
const logger = require('../utils/logger');
const community = require('../systems/community');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await community.sendMemberMessage(member, 'goodbye');
    const kicked = wasAction(`kick:${member.guild.id}:${member.id}`);
    await sendLog(member.guild, 'memberLeave', {
      target: member,
      title: kicked ? 'Mitglied gekickt' : 'Mitglied hat den Server verlassen',
      description: `${member.user.tag}${kicked ? ' wurde gekickt.' : ' hat den Server verlassen.'}`,
      fields: [{ name: 'Mitglieder gesamt', value: String(member.guild.memberCount), inline: true }],
    });
    await tickets.handleMemberLeave(member).catch((e) => logger.error('handleMemberLeave-Fehler:', e));
  },
};
