const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { respond } = require('../utils/helpers');
const { requireLevel, roleId } = require('../utils/permissions');
const { getConfig, save } = require('../database');
const { COLORS } = require('../config/constants');
const { validateJoinRole } = require('../systems/autoroles');

module.exports = {
  data: new SlashCommandBuilder().setName('autorole').setDescription('Automatische Rollen beim Beitritt')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('list').setDescription('Zeigt die Auto-Rollen-Konfiguration'))
    .addSubcommand((s) => s.setName('add').setDescription('Zusätzliche Join-Rolle hinzufügen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Join-Rolle entfernen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))
    .addSubcommandGroup((g) => g.setName('set').setDescription('Feste System-Rollen setzen')
      .addSubcommand((s) => s.setName('member').setDescription('Member-Rolle setzen (NICHT für Auto-Join!)').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))
      .addSubcommand((s) => s.setName('unverified').setDescription('Unverified-Rolle setzen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))
      .addSubcommand((s) => s.setName('bot').setDescription('Bot-Rolle setzen').addRoleOption((o) => o.setName('role').setDescription('Rolle').setRequired(true)))),

  async execute(i) {
    if (!(await requireLevel(i, 'admin'))) return;
    const group = i.options.getSubcommandGroup(false);
    const sub = i.options.getSubcommand();
    const cfg = getConfig(i.guildId);

    if (group === 'set') {
      if (!(await requireLevel(i, 'owner'))) return;
      const role = i.options.getRole('role');
      const key = sub.toUpperCase();
      const err = validateJoinRole(i.guild, role) && key !== 'MEMBER' ? validateJoinRole(i.guild, role) : null;
      // MEMBER darf hier gesetzt werden (wird ja NICHT beim Join vergeben, sondern erst nach Verify), nur echte Systemcheck:
      if (key !== 'MEMBER' && err) return respond(i, `❌ ${err}`);
      cfg.roles[key] = role.id;
      save();
      return respond(i, `✅ ${key}-Rolle gesetzt auf ${role}.`);
    }

    if (sub === 'list') {
      const list = cfg.autoroles.onJoin.map((id) => `<@&${id}>`).join(', ') || '*keine*';
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('🤖 Auto-Rollen')
        .addFields(
          { name: 'Beim Join (Unverified)', value: `<@&${roleId(i.guildId, 'UNVERIFIED')}>` },
          { name: 'Zusätzliche Join-Rollen', value: list },
          { name: 'Nach Verifizierung (Member)', value: `<@&${roleId(i.guildId, 'MEMBER')}>` },
          { name: 'Bot-Rolle', value: `<@&${roleId(i.guildId, 'BOT')}>` },
        )] });
    }
    if (sub === 'add') {
      const role = i.options.getRole('role');
      const err = validateJoinRole(i.guild, role);
      if (err) return respond(i, `❌ ${err}`);
      if (!cfg.autoroles.onJoin.includes(role.id)) cfg.autoroles.onJoin.push(role.id);
      save();
      return respond(i, `✅ ${role} wird jetzt beim Beitritt vergeben.`);
    }
    if (sub === 'remove') {
      const role = i.options.getRole('role');
      cfg.autoroles.onJoin = cfg.autoroles.onJoin.filter((id) => id !== role.id);
      save();
      return respond(i, `✅ ${role} entfernt.`);
    }
  },
};
