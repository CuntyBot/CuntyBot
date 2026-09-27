const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { respond } = require('../utils/helpers');
const xpCmd = require('../systems/xp/commands');
const { areaView, guardArea } = require('../systems/config');

module.exports = {
  data: new SlashCommandBuilder().setName('voice').setDescription('Voice-XP-System (getrennt von Text-XP)')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('xp').setDescription('Zeigt Voice-XP').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('level').setDescription('Zeigt Voice-Level').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Voice-Rangliste').addIntegerOption((o) => o.setName('page').setDescription('Seite').setMinValue(1)))
    .addSubcommand((s) => s.setName('config').setDescription('Voice-XP-Konfiguration (Admin)'))
    .addSubcommand((s) => s.setName('add').setDescription('Voice-XP hinzufügen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Menge').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('remove').setDescription('Voice-XP entfernen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Menge').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('reset').setDescription('Voice-XP zurücksetzen (Admin)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'xp') return xpCmd.show(i, 'voice');
    if (sub === 'level') return xpCmd.level(i, 'voice');
    if (sub === 'leaderboard') return xpCmd.leaderboard(i, 'voice');
    if (sub === 'config') { if (!(await guardArea(i, 'voice'))) return; return respond(i, areaView(i.guild, 'voice')); }
    if (sub === 'add') return xpCmd.admin(i, 'voice', 'add');
    if (sub === 'remove') return xpCmd.admin(i, 'voice', 'remove');
    if (sub === 'reset') return xpCmd.admin(i, 'voice', 'reset');
  },
};
