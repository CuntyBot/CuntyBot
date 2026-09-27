const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { respond, fmtNum } = require('../utils/helpers');
const { COLORS } = require('../config/constants');
const { getConfig } = require('../database');
const xpCmd = require('../systems/xp/commands');
const { totalXpForLevel } = require('../systems/xp/kinds');
const { adminModify } = require('../systems/xp');
const { requireLevel } = require('../utils/permissions');
const { areaView, guardArea } = require('../systems/config');

module.exports = {
  data: new SlashCommandBuilder().setName('level').setDescription('Text-Level-System')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('show').setDescription('Zeigt das Level').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Level-Rangliste').addIntegerOption((o) => o.setName('page').setDescription('Seite').setMinValue(1)))
    .addSubcommand((s) => s.setName('rewards').setDescription('Zeigt die Level-Belohnungen'))
    .addSubcommand((s) => s.setName('config').setDescription('Level-Konfiguration (Admin)'))
    .addSubcommand((s) => s.setName('set').setDescription('Level setzen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('level').setDescription('Neues Level').setRequired(true).setMinValue(0).setMaxValue(1000)))
    .addSubcommand((s) => s.setName('reset').setDescription('Level zurücksetzen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'show') return xpCmd.level(i, 'text');
    if (sub === 'leaderboard') return xpCmd.leaderboard(i, 'text', 'level');
    if (sub === 'rewards') {
      const cfg = getConfig(i.guildId).levelRoles.text;
      const list = Object.entries(cfg).sort((a, b) => a[0] - b[0]).map(([lvl, role]) => `**Level ${lvl}** → <@&${role}>`);
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('🏅 Level-Belohnungen').setDescription(list.join('\n') || 'Noch keine Level-Rollen eingerichtet. Nutze `/levelrole add`.')] }, { ephemeral: false });
    }
    if (sub === 'config') { if (!(await guardArea(i, 'level'))) return; return respond(i, areaView(i.guild, 'level')); }
    if (sub === 'set') {
      if (!(await requireLevel(i, 'admin'))) return;
      const user = i.options.getUser('user');
      const level = i.options.getInteger('level');
      await i.deferReply({ flags: 64 });
      const r = await adminModify(i.guild, i.user, user, 'text', 'set', totalXpForLevel(level));
      return respond(i, `✅ Level von ${user} gesetzt: **${r.levelBefore} → ${r.levelAfter}**`);
    }
    if (sub === 'reset') {
      if (!(await requireLevel(i, 'admin'))) return;
      const user = i.options.getUser('user');
      await i.deferReply({ flags: 64 });
      await adminModify(i.guild, i.user, user, 'text', 'reset', 0);
      return respond(i, `✅ Text-Level von ${user} wurde zurückgesetzt.`);
    }
  },
};
