const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { respond, fmtNum } = require('../utils/helpers');
const { requireLevel } = require('../utils/permissions');
const { getConfig, save } = require('../database');
const xpCmd = require('../systems/xp/commands');
const { AREAS, areaView, guardArea } = require('../systems/config');

module.exports = {
  data: new SlashCommandBuilder().setName('xp').setDescription('Text-XP-System')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('show').setDescription('Zeigt XP an').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('level').setDescription('Zeigt das aktuelle Level').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('XP-Rangliste').addIntegerOption((o) => o.setName('page').setDescription('Seite').setMinValue(1)))
    .addSubcommand((s) => s.setName('config').setDescription('XP-Konfiguration (Admin)'))
    .addSubcommand((s) => s.setName('add').setDescription('XP hinzufügen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Menge').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('remove').setDescription('XP entfernen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Menge').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('set').setDescription('XP setzen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Menge').setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s.setName('reset').setDescription('XP zurücksetzen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommandGroup((g) => g.setName('multiplier').setDescription('XP-Multiplikatoren pro Rolle')
      .addSubcommand((s) => s.setName('add').setDescription('Multiplikator setzen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)).addNumberOption((o) => o.setName('factor').setDescription('z.B. 1.5 für +50%').setRequired(true).setMinValue(0.1).setMaxValue(10)))
      .addSubcommand((s) => s.setName('remove').setDescription('Multiplikator entfernen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))
      .addSubcommand((s) => s.setName('list').setDescription('Alle Multiplikatoren anzeigen'))),

  async execute(i) {
    const group = i.options.getSubcommandGroup(false);
    const sub = i.options.getSubcommand();

    if (group === 'multiplier') {
      if (!(await requireLevel(i, 'admin'))) return;
      const cfg = getConfig(i.guildId).xp;
      const role = i.options.getRole('role');
      if (sub === 'add') { cfg.multipliers[role.id] = i.options.getNumber('factor'); save(); return respond(i, `✅ Multiplikator für ${role}: **x${i.options.getNumber('factor')}**`); }
      if (sub === 'remove') { delete cfg.multipliers[role.id]; save(); return respond(i, `✅ Multiplikator für ${role} entfernt.`); }
      if (sub === 'list') {
        const entries = Object.entries(cfg.multipliers);
        return respond(i, entries.length ? entries.map(([id, f]) => `<@&${id}>: x${f}`).join('\n') : 'Keine Multiplikatoren gesetzt.');
      }
    }

    if (sub === 'show') return xpCmd.show(i, 'text');
    if (sub === 'level') return xpCmd.level(i, 'text');
    if (sub === 'leaderboard') return xpCmd.leaderboard(i, 'text');
    if (sub === 'add') return xpCmd.admin(i, 'text', 'add');
    if (sub === 'remove') return xpCmd.admin(i, 'text', 'remove');
    if (sub === 'set') return xpCmd.admin(i, 'text', 'set');
    if (sub === 'reset') return xpCmd.admin(i, 'text', 'reset');
    if (sub === 'config') {
      if (!(await guardArea(i, 'xp'))) return;
      return respond(i, areaView(i.guild, 'xp'));
    }
  },
};
