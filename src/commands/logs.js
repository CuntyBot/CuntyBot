const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { respond, truncate } = require('../utils/helpers');
const { requireLevel } = require('../utils/permissions');
const { getConfig, save } = require('../database');
const { COLORS, LOG_TYPES } = require('../config/constants');
const { areaView, guardArea } = require('../systems/config');

const CHOICES = Object.entries(LOG_TYPES).map(([value, d]) => ({ name: d.label, value }));

module.exports = {
  data: new SlashCommandBuilder().setName('logs').setDescription('Logging-System')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Setzt den Standard-Log-Kanal').addChannelOption((o) => o.setName('channel').setDescription('Log-Kanal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('config').setDescription('Öffnet die Log-Konfiguration'))
    .addSubcommand((s) => s.setName('enable').setDescription('Aktiviert eine Log-Kategorie').addStringOption((o) => o.setName('type').setDescription('Kategorie').setRequired(true).addChoices(...CHOICES.slice(0, 25))))
    .addSubcommand((s) => s.setName('disable').setDescription('Deaktiviert eine Log-Kategorie').addStringOption((o) => o.setName('type').setDescription('Kategorie').setRequired(true).addChoices(...CHOICES.slice(0, 25))))
    .addSubcommand((s) => s.setName('channel').setDescription('Setzt einen eigenen Kanal für eine Kategorie')
      .addStringOption((o) => o.setName('type').setDescription('Kategorie').setRequired(true).addChoices(...CHOICES.slice(0, 25)))
      .addChannelOption((o) => o.setName('channel').setDescription('Kanal').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Zeigt die aktuellen Log-Einstellungen')),

  async execute(i) {
    if (!(await requireLevel(i, 'admin'))) return;
    const sub = i.options.getSubcommand();
    const cfg = getConfig(i.guildId);

    if (sub === 'setup') {
      cfg.channels.LOGS = i.options.getChannel('channel').id;
      save();
      return respond(i, `✅ Standard-Log-Kanal gesetzt: ${i.options.getChannel('channel')}`);
    }
    if (sub === 'config') { if (!(await guardArea(i, 'logs'))) return; return respond(i, areaView(i.guild, 'logs')); }
    if (sub === 'enable' || sub === 'disable') {
      cfg.logs.enabled[i.options.getString('type')] = sub === 'enable';
      save();
      return respond(i, `✅ ${LOG_TYPES[i.options.getString('type')].label} wurde ${sub === 'enable' ? 'aktiviert' : 'deaktiviert'}.`);
    }
    if (sub === 'channel') {
      cfg.logs.channels[i.options.getString('type')] = i.options.getChannel('channel').id;
      save();
      return respond(i, `✅ ${LOG_TYPES[i.options.getString('type')].label} wird jetzt in ${i.options.getChannel('channel')} geloggt.`);
    }
    if (sub === 'list') {
      const lines = Object.entries(LOG_TYPES).map(([key, d]) => {
        const enabled = cfg.logs.enabled[key] !== false;
        const ch = cfg.logs.channels[key] || cfg.channels.LOGS;
        return `${enabled ? '✅' : '❌'} ${d.emoji} **${d.label}** ${ch ? `→ <#${ch}>` : '*(kein Kanal gesetzt)*'}`;
      });
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('📋 Log-Einstellungen').setDescription(truncate(lines.join('\n'), 4000))] });
    }
  },
};
