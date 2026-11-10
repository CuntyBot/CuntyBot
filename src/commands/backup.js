const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('../database');
const { requireLevel } = require('../utils/permissions');
const { sendLog } = require('../systems/logging');

const MAX_BYTES = 7.5 * 1024 * 1024; // sicher unter dem Discord-Limit für Dateianhänge

module.exports = {
  data: new SlashCommandBuilder().setName('backup').setDescription('Backup aller Bot-Daten dieses Servers als Datei (nur Owner)'),
  async execute(i) {
    if (!(await requireLevel(i, 'owner'))) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = i.guild.id;
    const backup = {
      createdAt: new Date().toISOString(),
      guildId,
      guildName: i.guild.name,
      config: db.getConfig(guildId),
      users: db.guildUsers(guildId),
      tickets: db.guildTickets(guildId),
      reports: db.guildReports(guildId),
      warnings: db.guildWarnings(guildId),
    };

    const buf = Buffer.from(JSON.stringify(backup, null, 2), 'utf8');
    if (buf.length > MAX_BYTES) {
      return i.editReply('❌ Das Backup ist zu groß zum Versenden (über 7,5 MB). Sag mir Bescheid, dann bauen wir eine aufgeteilte Version.');
    }

    const file = new AttachmentBuilder(buf, { name: `backup-${guildId}-${backup.createdAt.slice(0, 10)}.json` });
    await i.editReply({
      content: `📦 Dein Backup ist fertig: ${backup.users.length} User, ${backup.tickets.length} Tickets, ${backup.reports.length} Reports, ${backup.warnings.length} Warnungen.\nBewahre die Datei sicher auf, sie enthält alle Bot-Daten dieses Servers.`,
      files: [file],
    });
    await sendLog(i.guild, 'botActions', { target: i.user, title: 'Backup erstellt', description: `${i.user} hat ein Backup erstellt.` });
  },
};
