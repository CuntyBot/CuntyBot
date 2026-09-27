const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { respond } = require('../utils/helpers');
const { requireLevel, canBotManageRole } = require('../utils/permissions');
const { getConfig, guildUsers, save } = require('../database');
const { COLORS } = require('../config/constants');
const { syncLevelRoles } = require('../systems/levelRoles');
const { areaView, guardArea } = require('../systems/config');

module.exports = {
  data: new SlashCommandBuilder().setName('levelrole').setDescription('Rollen-Belohnungen für Level')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Level-Rolle hinzufügen')
      .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(1000))
      .addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Text oder Voice').setRequired(true).addChoices({ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' })))
    .addSubcommand((s) => s.setName('remove').setDescription('Level-Rolle entfernen')
      .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Text oder Voice').setRequired(true).addChoices({ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' })))
    .addSubcommand((s) => s.setName('list').setDescription('Alle Level-Rollen anzeigen'))
    .addSubcommand((s) => s.setName('config').setDescription('Verhalten der Level-Rollen konfigurieren')),

  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'config') { if (!(await guardArea(i, 'xp'))) return; return respond(i, areaView(i.guild, 'xp')); }
    if (!(await requireLevel(i, 'admin'))) return;
    const cfg = getConfig(i.guildId).levelRoles;

    if (sub === 'add') {
      const level = i.options.getInteger('level');
      const role = i.options.getRole('role');
      const type = i.options.getString('type');
      if (!canBotManageRole(i.guild, role)) return respond(i, '❌ Ich kann diese Rolle nicht vergeben (Bot-Rolle muss höher stehen + Recht „Rollen verwalten“).');
      cfg[type][level] = role.id;
      save();
      await respond(i, `✅ Ab **${type === 'text' ? 'Text-' : 'Voice-'}Level ${level}** wird ${role} vergeben.`);
      for (const u of guildUsers(i.guildId)) {
        const member = await i.guild.members.fetch(u.userId).catch(() => null);
        if (member) await syncLevelRoles(i.guild, member, type).catch(() => {});
      }
      return;
    }
    if (sub === 'remove') {
      const type = i.options.getString('type');
      if (!cfg[type][i.options.getInteger('level')]) return respond(i, '❌ Für dieses Level ist keine Rolle gesetzt.');
      delete cfg[type][i.options.getInteger('level')];
      save();
      return respond(i, '✅ Level-Rolle entfernt.');
    }
    if (sub === 'list') {
      const lines = (type) => Object.entries(cfg[type]).sort((a, b) => a[0] - b[0]).map(([l, r]) => `Level ${l} → <@&${r}>`).join('\n') || '*keine*';
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('🏅 Level-Rollen')
        .addFields({ name: '💬 Text', value: lines('text') }, { name: '🎙️ Voice', value: lines('voice') })] });
    }
  },
};
