const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(before, after) {
    if (before.channelId === after.channelId) return;
    const guild = after.guild;
    const member = after.member;
    if (!before.channelId && after.channelId) {
      await sendLog(guild, 'voiceJoin', { description: `🔊 ${member} ist ${after.channel} beigetreten.` });
    } else if (before.channelId && !after.channelId) {
      await sendLog(guild, 'voiceLeave', { description: `🔇 ${member} hat ${before.channel} verlassen.` });
    } else {
      await sendLog(guild, 'voiceMove', { description: `🔀 ${member} wechselte von ${before.channel} zu ${after.channel}.` });
    }
  },
};
