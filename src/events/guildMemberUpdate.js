const { Events } = require('discord.js');
const { sendLog } = require('../systems/logging');
const { roleId } = require('../utils/permissions');
const { wasAction } = require('../systems/moderation');
const { ts } = require('../utils/helpers');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(before, after) {
    const guild = after.guild;
    const skip = new Set([roleId(guild.id, 'MEMBER'), roleId(guild.id, 'UNVERIFIED')]); // wird bereits von der Verifizierung geloggt

    const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id) && !skip.has(r.id));
    const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id) && !skip.has(r.id));
    if (added.size) await sendLog(guild, 'roleAdd', { description: `➕ ${added.map((r) => r).join(', ')} zu ${after} hinzugefügt.` });
    if (removed.size) await sendLog(guild, 'roleRemove', { description: `➖ ${removed.map((r) => r).join(', ')} von ${after} entfernt.` });

    if (before.nickname !== after.nickname) {
      await sendLog(guild, 'nicknameChange', {
        description: `📝 Nickname von ${after} geändert.`,
        fields: [{ name: 'Vorher', value: before.nickname || before.user.username, inline: true }, { name: 'Nachher', value: after.nickname || after.user.username, inline: true }],
      });
    }

    const beforeT = before.communicationDisabledUntilTimestamp;
    const afterT = after.communicationDisabledUntilTimestamp;
    if (!beforeT && afterT && !wasAction(`timeout:${guild.id}:${after.id}`)) {
      await sendLog(guild, 'timeout', { description: `⏳ ${after} hat einen Timeout erhalten (bis ${ts(afterT)}).` });
    }
  },
};
