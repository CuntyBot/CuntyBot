const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { respond } = require('../utils/helpers');
const { getConfig } = require('../database');
const { COLORS } = require('../config/constants');
const { homeView, areaView, guardArea } = require('../systems/config');
const { requireLevel } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('config').setDescription('Haupt-Konfiguration des Bots')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('menu').setDescription('Öffnet das Konfigurationsmenü'))
    .addSubcommand((s) => s.setName('roles').setDescription('Konfiguriert Rollen (Owner)'))
    .addSubcommand((s) => s.setName('channels').setDescription('Konfiguriert Channels'))
    .addSubcommand((s) => s.setName('categories').setDescription('Konfiguriert Kategorien'))
    .addSubcommand((s) => s.setName('permissions').setDescription('Konfiguriert Berechtigungen (Owner)'))
    .addSubcommand((s) => s.setName('view').setDescription('Zeigt die komplette Serverkonfiguration')),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const map = { roles: 'roles', channels: 'channels', categories: 'categories', permissions: 'permissions' };
    if (map[sub]) {
      if (!(await guardArea(i, map[sub]))) return;
      return respond(i, areaView(i.guild, map[sub]));
    }
    if (sub === 'menu') {
      if (!(await requireLevel(i, 'admin'))) return;
      return respond(i, homeView(i.member));
    }
    if (sub === 'view') {
      if (!(await requireLevel(i, 'admin'))) return;
      const cfg = getConfig(i.guildId);
      const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('⚙️ Aktuelle Serverkonfiguration')
        .addFields(
          { name: '🎭 Rollen', value: Object.entries(cfg.roles).length ? Object.entries(cfg.roles).map(([k, v]) => `${k}: <@&${v}>`).join('\n') : '*Standardwerte aktiv*' },
          { name: '📺 Channels', value: Object.entries(cfg.channels).filter(([, v]) => v).map(([k, v]) => `${k}: <#${v}>`).join('\n') || '*keine gesetzt*' },
          { name: '🗂️ Kategorien', value: Object.entries(cfg.categories).filter(([, v]) => v).map(([k, v]) => `${k}: <#${v}>`).join('\n') || '*keine gesetzt*' },
          { name: '🎫 Tickets', value: `Max/User: ${cfg.tickets.maxOpenPerUser} • Typen: ${Object.keys(cfg.tickets.types).length}` },
          { name: '📊 Text-XP', value: cfg.xp.enabled ? `An (${cfg.xp.minXp}-${cfg.xp.maxXp} XP, ${cfg.xp.cooldownSec}s CD)` : 'Aus' },
          { name: '🔊 Voice-XP', value: cfg.voice.enabled ? `An (${cfg.voice.xpPerMinute} XP/Min., min. ${cfg.voice.minMembers} Personen)` : 'Aus' },
        );
      return respond(i, { embeds: [embed] });
    }
  },
};
